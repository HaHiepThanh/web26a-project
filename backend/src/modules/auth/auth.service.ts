import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { CurrentUserInfo } from '../../common/firebase/current-user.decorator';

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
    const { data, error } = await this.supabase.client
      .from('users')
      .upsert(
        {
          id: user.uid,
          email: user.email ?? '',
          display_name: user.displayName ?? null,
          avatar_url: user.avatarUrl ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )
      .select()
      .single();

    if (error) {
      this.logger.error(`Upsert users thất bại (uid=${user.uid}): ${error.message}`);
      throw new InternalServerErrorException('Không lưu được hồ sơ người dùng');
    }

    const row = data as UserRow;
    return initial ? this.fillInitialProfile(row, initial) : row;
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
