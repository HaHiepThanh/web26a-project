import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Thông tin user lấy từ Firebase ID token (do FirebaseAuthGuard gắn vào req). */
export interface CurrentUserInfo {
  uid: string; // Firebase uid = users.id trong DB
  email?: string;
}

/** Dùng: `method(@CurrentUser() user: CurrentUserInfo) {}` để lấy user hiện tại. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserInfo => {
    return ctx.switchToHttp().getRequest().user;
  },
);
