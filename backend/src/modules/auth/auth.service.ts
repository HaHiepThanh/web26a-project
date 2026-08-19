import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { CurrentUserInfo } from '../../common/firebase/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';

/**
 * Ép chuỗi về đúng định dạng username mà frontend đang validate:
 * chỉ chữ/số/gạch dưới/chấm, dài 3–25 ký tự.
 */
function sanitizeUsername(raw: string): string {
  let s = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // bỏ dấu tiếng Việt
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, 25);
  if (s.length < 3) s = `user${s}`.slice(0, 25); // quá ngắn thì thêm tiền tố
  return s;
}

/** Thông tin người dùng tự nhập lúc đăng ký (không có trong Firebase token). */
export interface InitialProfile {
  username?: string;
  phone?: string;
}

/** Bản ghi trong bảng `users` (khớp database.sql mục 2). */
export interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  username: string | null;
  phone: string | null;
  job_title: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

/** Tổ chức mà user đang là thành viên, kèm vai trò. */
export interface MyOrganization {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'admin' | 'member';
}

export interface MeResponse {
  user: UserRow;
  organizations: MyOrganization[];
  /** true khi user chưa thuộc tổ chức nào → frontend đưa sang màn /onboarding. */
  needsOnboarding: boolean;
}

/** Đồng bộ hồ sơ user (Firebase) vào bảng `users` + trả thông tin "me". */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Ghi hồ sơ Firebase vào bảng `users`.
   *
   * Dùng upsert (INSERT ... ON CONFLICT DO UPDATE) chứ không phải "kiểm tra tồn
   * tại rồi mới insert": hai request đăng nhập gần nhau có thể cùng thấy "chưa
   * tồn tại" rồi cùng insert → một cái vỡ vì trùng khoá chính.
   *
   * Chỉ ghi đè các trường do Firebase quản lý (email/tên/ảnh). KHÔNG đụng tới
   * `username`, `phone`, `job_title` — đó là dữ liệu người dùng tự nhập trong
   * trang Cài đặt, đăng nhập lại mà xoá mất là mất dữ liệu.
   */
  async syncProfile(user: CurrentUserInfo, initial?: InitialProfile): Promise<UserRow> {
    // Bước 1: tạo dòng nếu chưa có. `ignoreDuplicates` = INSERT ... ON CONFLICT
    // DO NOTHING — một câu lệnh nguyên tử, hai request đăng nhập cùng lúc không
    // thể cùng insert rồi vỡ vì trùng khoá chính.
    const { error: insertError } = await this.supabase.client.from('users').upsert(
      {
        id: user.uid,
        email: user.email ?? '',
        display_name: user.displayName ?? null,
        avatar_url: user.avatarUrl ?? null,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    );
    if (insertError) {
      this.logger.error(`Tạo users thất bại (uid=${user.uid}): ${insertError.message}`);
      throw new InternalServerErrorException('Không lưu được hồ sơ người dùng');
    }

    const { data, error } = await this.supabase.client
      .from('users')
      .select()
      .eq('id', user.uid)
      .single();
    if (error) {
      this.logger.error(`Đọc users thất bại (uid=${user.uid}): ${error.message}`);
      throw new InternalServerErrorException('Không đọc được hồ sơ người dùng');
    }

    let row = data as UserRow;

    // Bước 2: đồng bộ có chọn lọc.
    //
    // ⚠️ Chỗ này từng có bug: bản đầu ghi đè display_name/avatar_url theo token ở
    // MỌI lần gọi. Nhưng đó cũng là 2 trường người dùng sửa được trong trang Cài
    // đặt — nên sửa tên xong, F5 một cái là bị token đạp lại. Giờ chỉ điền khi ô
    // đang trống. Riêng `email` thì luôn theo Firebase vì Firebase mới là nơi
    // quản lý email, và người dùng không sửa được email ở app này.
    const patch: Record<string, string | null> = {};
    const email = user.email ?? '';
    if (email && row.email !== email) patch.email = email;
    if (!row.display_name && user.displayName) patch.display_name = user.displayName;
    if (!row.avatar_url && user.avatarUrl) patch.avatar_url = user.avatarUrl;

    if (Object.keys(patch).length > 0) {
      const { data: updated, error: updateError } = await this.supabase.client
        .from('users')
        .update(patch)
        .eq('id', user.uid)
        .select()
        .single();
      if (updateError) {
        this.logger.warn(`Đồng bộ hồ sơ thất bại (uid=${user.uid}): ${updateError.message}`);
      } else {
        row = updated as UserRow;
      }
    }

    if (initial) row = await this.fillInitialProfile(row, initial);

    // Google không cấp username. Nếu vẫn trống thì tự sinh, nếu không cột
    // `username` sẽ null vĩnh viễn và ô trong trang Cài đặt luôn rỗng.
    if (!row.username) row = await this.assignGeneratedUsername(row);
    return row;
  }

  /**
   * Tự cấp username từ phần trước @ của email: 'nam.nguyen@gmail.com' → 'nam.nguyen'.
   *
   * `users.username` có ràng buộc UNIQUE nên phải xử lý trùng: 'thanh@gmail.com' và
   * 'thanh@congty.vn' cùng ra gốc 'thanh'. Bắt trực tiếp lỗi 23505 rồi thử hậu tố
   * số, thay vì "kiểm tra trước rồi mới ghi" — giữa 2 bước đó người khác vẫn chen được.
   */
  private async assignGeneratedUsername(row: UserRow): Promise<UserRow> {
    const base = sanitizeUsername(row.email.split('@')[0] || 'user');

    for (let i = 0; i < 25; i++) {
      const candidate = i === 0 ? base : `${base}${i + 1}`.slice(0, 25);
      const { data, error } = await this.supabase.client
        .from('users')
        .update({ username: candidate })
        .eq('id', row.id)
        .select()
        .single();

      if (!error) return data as UserRow;
      if (error.code !== '23505') {
        this.logger.warn(`Không cấp được username cho ${row.id}: ${error.message}`);
        return row; // Không chặn đăng nhập chỉ vì thiếu username.
      }
    }
    this.logger.warn(`Thử 25 lần vẫn không tìm được username trống cho ${row.id}`);
    return row;
  }

  /**
   * Điền username/phone người dùng nhập lúc ĐĂNG KÝ.
   *
   * CHỈ điền khi ô đó đang trống. Nếu ghi đè vô điều kiện thì mỗi lần đăng nhập
   * lại sẽ đạp lên thông tin họ đã sửa trong trang Cài đặt.
   */
  private async fillInitialProfile(row: UserRow, initial: InitialProfile): Promise<UserRow> {
    const patch: Record<string, string> = {};
    if (!row.username && initial.username?.trim()) patch.username = initial.username.trim();
    if (!row.phone && initial.phone?.trim()) patch.phone = initial.phone.trim();
    if (Object.keys(patch).length === 0) return row;

    const { data, error } = await this.supabase.client
      .from('users')
      .update(patch)
      .eq('id', row.id)
      .select()
      .single();

    if (error) {
      // `users.username` có ràng buộc UNIQUE — người khác lấy mất thì báo rõ,
      // nhưng KHÔNG làm hỏng việc đăng ký: tài khoản đã tạo xong rồi.
      if (error.code === '23505') {
        throw new ConflictException(`Tên đăng nhập "${patch.username}" đã có người dùng.`);
      }
      this.logger.error(`Cập nhật hồ sơ ban đầu thất bại (uid=${row.id}): ${error.message}`);
      return row;
    }
    return data as UserRow;
  }

  /**
   * Cập nhật hồ sơ người dùng tự sửa trong trang Cài đặt.
   * Chỉ ghi những trường được gửi lên — không đụng tới trường bỏ trống.
   */
  async updateProfile(user: CurrentUserInfo, dto: UpdateProfileDto): Promise<UserRow> {
    const patch: Record<string, string | null> = {};
    if (dto.displayName !== undefined) patch.display_name = dto.displayName.trim() || null;
    if (dto.username !== undefined) patch.username = dto.username.trim() || null;
    if (dto.phone !== undefined) patch.phone = dto.phone.trim() || null;
    if (dto.jobTitle !== undefined) patch.job_title = dto.jobTitle.trim() || null;
    if (dto.avatarUrl !== undefined) patch.avatar_url = dto.avatarUrl.trim() || null;

    if (Object.keys(patch).length === 0) {
      return this.syncProfile(user);
    }

    const { data, error } = await this.supabase.client
      .from('users')
      .update(patch)
      .eq('id', user.uid)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException(`Tên đăng nhập "${dto.username}" đã có người dùng.`);
      }
      this.logger.error(`Cập nhật hồ sơ thất bại (uid=${user.uid}): ${error.message}`);
      throw new InternalServerErrorException('Không lưu được hồ sơ');
    }
    return data as UserRow;
  }

  /**
   * Hồ sơ user + danh sách tổ chức của họ.
   * Frontend gọi ngay sau khi đăng nhập để biết có cần onboarding không.
   */
  async getMe(user: CurrentUserInfo): Promise<MeResponse> {
    // Vẫn upsert ở đây để lần đăng nhập đầu tiên chỉ cần 1 request là đủ,
    // đồng thời cập nhật tên/ảnh nếu người dùng vừa đổi bên Google.
    const profile = await this.syncProfile(user);

    const { data, error } = await this.supabase.client
      .from('organization_members')
      .select('role, organizations(id, name, slug)')
      .eq('user_id', user.uid);

    if (error) {
      this.logger.error(`Đọc organization_members thất bại (uid=${user.uid}): ${error.message}`);
      throw new InternalServerErrorException('Không đọc được danh sách tổ chức');
    }

    type Row = {
      role: MyOrganization['role'];
      organizations: { id: string; name: string; slug: string } | null;
    };

    const organizations: MyOrganization[] = (data as unknown as Row[])
      .filter((r) => r.organizations)
      .map((r) => ({
        id: r.organizations!.id,
        name: r.organizations!.name,
        slug: r.organizations!.slug,
        role: r.role,
      }));

    return {
      user: profile,
      organizations,
      needsOnboarding: organizations.length === 0,
    };
  }
}
