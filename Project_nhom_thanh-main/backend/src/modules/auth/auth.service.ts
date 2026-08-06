import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { CurrentUserInfo } from '../../common/firebase/current-user.decorator';

/** Đồng bộ hồ sơ user (Firebase) vào bảng `users` + trả thông tin "me". */
@Injectable()
export class AuthService {
  constructor(private readonly supabase: SupabaseService) {}

  // TODO: upsert vào bảng users (id = uid, email, display_name, avatar_url).
  //       Gọi sau lần đăng nhập đầu (từ FE hoặc trong AuthGuard).
  async syncProfile(user: CurrentUserInfo): Promise<void> {}

  // TODO: trả hồ sơ user + tenant hiện tại (nếu có) để FE biết cần onboarding không.
  async getMe(user: CurrentUserInfo): Promise<unknown> {
    return null;
  }
}
