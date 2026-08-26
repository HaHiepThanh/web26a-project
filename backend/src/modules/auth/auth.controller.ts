import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FirebaseAuthGuard } from '../../common/firebase/firebase-auth.guard';
import { CurrentUser } from '../../common/firebase/current-user.decorator';
import type { CurrentUserInfo } from '../../common/firebase/current-user.decorator';
import { AuthService } from './auth.service';
import { toUserProfile } from './auth.service';
import type { MeResponse, UserProfile } from './auth.service';
import { SyncProfileDto } from './dto/sync-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB

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
  async sync(
    @CurrentUser() user: CurrentUserInfo,
    @Body() body: SyncProfileDto,
  ): Promise<UserProfile> {
    return toUserProfile(await this.auth.syncProfile(user, body));
  }

  /** PATCH /auth/profile — lưu thay đổi từ trang Cài đặt xuống database. */
  @Patch('profile')
  async updateProfile(
    @CurrentUser() user: CurrentUserInfo,
    @Body() body: UpdateProfileDto,
  ): Promise<UserProfile> {
    return toUserProfile(await this.auth.updateProfile(user, body));
  }

  /**
   * POST /auth/avatar — Tải ảnh đại diện lên Supabase Storage và lưu URL vào database.
   */
  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_AVATAR_BYTES } }),
  )
  async uploadAvatar(
    @CurrentUser() user: CurrentUserInfo,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ avatarUrl: string }> {
    return this.auth.uploadAvatar(user, file);
  }

  /** GET /auth/me — hồ sơ + danh sách tổ chức + cờ needsOnboarding. */
  @Get('me')
  me(@CurrentUser() user: CurrentUserInfo): Promise<MeResponse> {
    return this.auth.getMe(user);
  }
}
