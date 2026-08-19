import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../../common/firebase/firebase-auth.guard';
import { CurrentUser } from '../../common/firebase/current-user.decorator';
import type { CurrentUserInfo } from '../../common/firebase/current-user.decorator';
import { AuthService } from './auth.service';
import type { MeResponse, UserRow } from './auth.service';
import { SyncProfileDto } from './dto/sync-profile.dto';

/**
 * Mọi route ở đây đều yêu cầu 'Authorization: Bearer <Firebase ID token>'.
 * Không có token / token sai → 401.
 */
@UseGuards(FirebaseAuthGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * POST /auth/sync — ghi hồ sơ Firebase vào bảng `users`.
   * Body tuỳ chọn `{ username, phone }` chỉ dùng lúc đăng ký; các ô đã có giá trị
   * sẽ KHÔNG bị ghi đè.
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  sync(@CurrentUser() user: CurrentUserInfo, @Body() body: SyncProfileDto): Promise<UserRow> {
    return this.auth.syncProfile(user, body);
  }

  /** GET /auth/me — hồ sơ + danh sách tổ chức + cờ needsOnboarding. */
  @Get('me')
  me(@CurrentUser() user: CurrentUserInfo): Promise<MeResponse> {
    return this.auth.getMe(user);
  }
}
