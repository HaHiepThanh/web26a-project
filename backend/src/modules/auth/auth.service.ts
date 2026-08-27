import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { getAuth } from 'firebase-admin/auth';
import { MailService } from '../../common/mail/mail.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ModerationService } from '../../common/moderation/moderation.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { CurrentUserInfo } from '../../common/firebase/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';

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
  /** Tour hướng dẫn. NULL = tài khoản có trước migration 0007, hoặc chưa chạy. */
  onboarding_state: unknown | null;
  /** Đã nối Google chưa (migration 0009). NULL = chưa. */
  google_linked_at: string | null;
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

/**
 * Hồ sơ user như API trả ra ngoài — camelCase, thống nhất với mọi endpoint khác.
 *
 * `UserRow` ở trên là dòng thô của database (snake_case) và CHỈ dùng nội bộ trong
 * service. Trả thẳng nó ra ngoài là để lộ tên cột database vào hợp đồng API —
 * đổi tên cột một cái là gãy frontend.
 */
export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  username: string | null;
  phone: string | null;
  jobTitle: string | null;
  avatarUrl: string | null;
  onboardingState: unknown | null;
  /** Đã nối tài khoản Google chưa — quyết định có bật được nút soạn lịch họp không. */
  googleLinked: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toUserProfile(row: UserRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    username: row.username,
    phone: row.phone,
    jobTitle: row.job_title,
    avatarUrl: row.avatar_url,
    onboardingState: row.onboarding_state ?? null,
    googleLinked: !!row.google_linked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface MeResponse {
  user: UserProfile;
  organizations: MyOrganization[];
  /** true khi user chưa thuộc tổ chức nào → frontend đưa sang màn /onboarding. */
  needsOnboarding: boolean;
}

/** Đồng bộ hồ sơ user (Firebase) vào bảng `users` + trả thông tin "me". */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly realtime: RealtimeGateway,
    private readonly moderation: ModerationService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Xử lý yêu cầu quên mật khẩu: tạo link reset chuẩn của Firebase Admin
   * và gửi email HTML đẹp chứa link trực tiếp về trang /reset-password của website.
   */
  async handleForgotPassword(
    dto: ForgotPasswordDto,
  ): Promise<{ message: string; mailConfigured: boolean }> {
    const email = dto.email.trim().toLowerCase();
    try {
      // Dùng Firebase Admin SDK để tạo link reset
      const rawLink = await getAuth().generatePasswordResetLink(email);
      const parsed = new URL(rawLink);
      const oobCode = parsed.searchParams.get('oobCode');
      const origin =
        dto.origin?.replace(/\/+$/, '') ||
        'https://horizon-hub-harmony.firebaseapp.com';
      const customResetUrl = `${origin}/reset-password?oobCode=${oobCode}`;

      // Gửi email qua MailService
      await this.mailService.sendPasswordResetEmail(email, customResetUrl);
    } catch (err) {
      this.logger.error(`Lỗi tạo link reset password cho ${email}:`, err);
      // Không ném lỗi ra ngoài để tránh user enumeration attack
    }

    return {
      // Câu chung chung để không lộ địa chỉ nào có tài khoản.
      message:
        'If an account exists with this email, a password reset link has been sent.',
      // Chỉ nói về CẤU HÌNH MÁY CHỦ, không nói về tài khoản — client dùng nó để
      // biết có phải quay về đường gửi mail của Firebase hay không.
      mailConfigured: this.mailService.daCauHinh,
    };
  }

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
  async syncProfile(
    user: CurrentUserInfo,
    initial?: InitialProfile,
  ): Promise<UserRow> {
    // Bước 1: tạo dòng nếu chưa có. `ignoreDuplicates` = INSERT ... ON CONFLICT
    // DO NOTHING — một câu lệnh nguyên tử, hai request đăng nhập cùng lúc không
    // thể cùng insert rồi vỡ vì trùng khoá chính.
    const { error: insertError } = await this.supabase.client
      .from('users')
      .upsert(
        {
          id: user.uid,
          email: user.email ?? '',
          display_name: user.displayName ?? null,
          avatar_url: user.avatarUrl ?? null,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      );
    if (insertError) {
      this.logger.error(
        `Tạo users thất bại (uid=${user.uid}): ${insertError.message}`,
      );
      throw new InternalServerErrorException('Failed to save user profile');
    }

    const { data, error } = await this.supabase.client
      .from('users')
      .select()
      .eq('id', user.uid)
      .single();
    if (error) {
      this.logger.error(
        `Đọc users thất bại (uid=${user.uid}): ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to load user profile');
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
    if (!row.display_name && user.displayName)
      patch.display_name = user.displayName;
    if (!row.avatar_url && user.avatarUrl) patch.avatar_url = user.avatarUrl;

    // Liên kết Google — nguồn là claim `firebase.identities` của ID token đã
    // verify (xem firebase-auth.guard.ts), KHÔNG phải body request.
    //
    // Ghi cả hai chiều: nối thì đóng dấu thời gian, gỡ thì xoá về NULL. Chỉ ghi
    // khi LỆCH, vì `syncProfile` chạy ở mọi `GET /auth/me` — ghi vô điều kiện là
    // một UPDATE thừa mỗi lần mở app, và `updated_at` sẽ nhảy liên tục.
    const daNoi = user.googleLinked === true;
    if (daNoi !== !!row.google_linked_at) {
      patch.google_linked_at = daNoi ? new Date().toISOString() : null;
    }

    if (Object.keys(patch).length > 0) {
      const { data: updated, error: updateError } = await this.supabase.client
        .from('users')
        .update(patch)
        .eq('id', user.uid)
        .select()
        .single();
      if (updateError) {
        this.logger.warn(
          `Đồng bộ hồ sơ thất bại (uid=${user.uid}): ${updateError.message}`,
        );
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
        this.logger.warn(
          `Không cấp được username cho ${row.id}: ${error.message}`,
        );
        return row; // Không chặn đăng nhập chỉ vì thiếu username.
      }
    }
    this.logger.warn(
      `Thử 25 lần vẫn không tìm được username trống cho ${row.id}`,
    );
    return row;
  }

  /**
   * Điền username/phone người dùng nhập lúc ĐĂNG KÝ.
   *
   * CHỈ điền khi ô đó đang trống. Nếu ghi đè vô điều kiện thì mỗi lần đăng nhập
   * lại sẽ đạp lên thông tin họ đã sửa trong trang Cài đặt.
   */
  private async fillInitialProfile(
    row: UserRow,
    initial: InitialProfile,
  ): Promise<UserRow> {
    const patch: Record<string, string> = {};
    if (!row.username && initial.username?.trim())
      patch.username = initial.username.trim();
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
        throw new ConflictException(
          `Username "${patch.username}" is already taken.`,
        );
      }
      this.logger.error(
        `Cập nhật hồ sơ ban đầu thất bại (uid=${row.id}): ${error.message}`,
      );
      return row;
    }
    return data as UserRow;
  }

  /**
   * Cập nhật hồ sơ người dùng tự sửa trong trang Cài đặt.
   * Chỉ ghi những trường được gửi lên — không đụng tới trường bỏ trống.
   */
  /**
   * Báo cho mọi tổ chức mà người này thuộc về: hồ sơ vừa đổi.
   *
   * Không có bước này thì B đổi avatar xong, A vẫn thấy ảnh cũ cho tới lần F5
   * kế tiếp — vì avatar của người khác đọc từ `OrganizationStore.membersByOrg`,
   * thứ chỉ nạp một lần lúc mở app rồi nằm im.
   *
   * Nuốt mọi lỗi: hồ sơ ĐÃ lưu xong rồi, báo hỏng thì cùng lắm người khác thấy
   * chậm một nhịp — không đáng để ném lỗi ngược về người vừa lưu thành công.
   */
  private async baoDoiHoSo(uid: string, row: UserRow): Promise<void> {
    try {
      const { data } = await this.supabase.client
        .from('organization_members')
        .select('org_id')
        .eq('user_id', uid);

      const payload = {
        id: row.id,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
      };
      for (const t of data ?? []) {
        this.realtime.emitToOrg(t.org_id, 'user.updated', uid, payload);
      }
    } catch (e) {
      this.logger.warn(
        `Không báo được thay đổi hồ sơ qua realtime (uid=${uid}): ${(e as Error).message}`,
      );
    }
  }

  async updateProfile(
    user: CurrentUserInfo,
    dto: UpdateProfileDto,
  ): Promise<UserRow> {
    // `unknown` chứ không `string | null`: onboardingState là một object jsonb,
    // không phải chuỗi. Supabase client tự tuần tự hoá sang jsonb giúp.
    const patch: Record<string, unknown> = {};
    if (dto.onboardingState !== undefined)
      patch.onboarding_state = dto.onboardingState;
    if (dto.displayName !== undefined)
      patch.display_name = dto.displayName.trim() || null;
    if (dto.username !== undefined)
      patch.username = dto.username.trim() || null;
    if (dto.phone !== undefined) patch.phone = dto.phone.trim() || null;
    if (dto.jobTitle !== undefined)
      patch.job_title = dto.jobTitle.trim() || null;
    if (dto.avatarUrl !== undefined)
      patch.avatar_url = dto.avatarUrl.trim() || null;

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
        throw new ConflictException(
          `Username "${dto.username}" is already taken.`,
        );
      }
      this.logger.error(
        `Cập nhật hồ sơ thất bại (uid=${user.uid}): ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to save profile');
    }
    const row = data as UserRow;
    await this.baoDoiHoSo(user.uid, row);
    return row;
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
      this.logger.error(
        `Đọc organization_members thất bại (uid=${user.uid}): ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to load organizations');
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
      user: toUserProfile(profile),
      organizations,
      needsOnboarding: organizations.length === 0,
    };
  }

  /**
   * Tải ảnh đại diện lên Supabase Storage (bucket `avatars`) và cập nhật `users.avatar_url`.
   */
  async uploadAvatar(
    user: CurrentUserInfo,
    file: Express.Multer.File,
  ): Promise<{ avatarUrl: string }> {
    if (!file) {
      throw new BadRequestException('No image file uploaded.');
    }

    // KIỂM DUYỆT TRƯỚC KHI LƯU.
    //
    // ⚠️ Bucket `avatars` là bucket CÔNG KHAI (`getPublicUrl` bên dưới). Lưu
    //    trước rồi quét sau nghĩa là ảnh có một khoảng thời gian sống dưới một
    //    URL ai cũng mở được, không cần đăng nhập — vài giây cũng đủ phát tán.
    //
    // `kiemTra` cũng trả về mime/đuôi suy từ NỘI DUNG THẬT của file. Bản cũ tin
    // `file.mimetype`, mà chuỗi đó do client khai: đổi tên `x.exe` thành
    // `x.png` rồi khai `image/png` là qua được danh sách trắng.
    const { mime, duoi } = await this.moderation.kiemTra(
      file.buffer,
      `avatar uid=${user.uid}`,
    );

    const storagePath = `${user.uid}/${Date.now()}${duoi}`;

    const { error: uploadError } = await this.supabase.client.storage
      .from('avatars')
      .upload(storagePath, file.buffer, {
        contentType: mime,
        upsert: true,
      });

    if (uploadError) {
      this.logger.error(
        `Upload avatar lên Storage thất bại (uid=${user.uid}): ${uploadError.message}`,
      );
      throw new InternalServerErrorException('Failed to upload avatar image.');
    }

    const { data: publicData } = this.supabase.client.storage
      .from('avatars')
      .getPublicUrl(storagePath);

    const publicUrl = publicData.publicUrl;

    // `.select().single()` để lấy lại dòng đã ghi — cần `display_name` cho gói
    // tin realtime, mà hàm này chỉ nhận vào mỗi file ảnh.
    const { data: row, error: updateError } = await this.supabase.client
      .from('users')
      .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', user.uid)
      .select()
      .single();

    if (updateError) {
      this.logger.error(
        `Cập nhật avatar_url thất bại (uid=${user.uid}): ${updateError.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to update avatar in database.',
      );
    }

    // ĐƯỜNG CHÍNH của việc đổi avatar đi qua đây, KHÔNG qua `updateProfile` —
    // thiếu dòng này là người khác vẫn thấy ảnh cũ tới lần F5 kế tiếp.
    await this.baoDoiHoSo(user.uid, row as UserRow);

    return { avatarUrl: publicUrl };
  }
}
