import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../../common/firebase/firebase-auth.guard';
import { CurrentUser } from '../../common/firebase/current-user.decorator';
import type { CurrentUserInfo } from '../../common/firebase/current-user.decorator';
import { AuthService } from './auth.service';

@UseGuards(FirebaseAuthGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // POST /auth/sync — đồng bộ hồ sơ sau khi đăng nhập Firebase lần đầu.
  @Post('sync')
  sync(@CurrentUser() user: CurrentUserInfo): Promise<void> {
    return this.auth.syncProfile(user);
  }

  // GET /auth/me — thông tin user hiện tại (+ tenant nếu có).
  @Get('me')
  me(@CurrentUser() user: CurrentUserInfo): Promise<unknown> {
    return this.auth.getMe(user);
  }
}
