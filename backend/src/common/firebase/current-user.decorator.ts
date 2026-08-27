import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Thông tin user lấy từ Firebase ID token (do FirebaseAuthGuard gắn vào req). */
export interface CurrentUserInfo {
  uid: string; // Firebase uid = users.id trong DB
  email?: string;
  displayName?: string; // claim `name` — Google trả về tên hiển thị
  avatarUrl?: string; // claim `picture` — ảnh đại diện Google
  /**
   * Tài khoản này có nối google.com không — suy ra từ claim
   * `firebase.identities` của ID TOKEN ĐÃ VERIFY CHỮ KÝ.
   *
   * ⚠️ CỐ Ý không nhận cờ này từ body request. Nó quyết định ai được chọn vào
   *    danh sách mời họp; tin client tự khai thì ai cũng bịa được "tôi đã nối
   *    Google". Token thì Firebase ký, không bịa được.
   *
   * Lưu ý về độ trễ: ID token chỉ làm mới khoảng mỗi giờ, nên vừa nối/gỡ xong
   * thì claim còn cũ. Frontend phải gọi `getIdToken(true)` rồi `POST /auth/sync`
   * ngay sau khi nối/gỡ để cập nhật tức thì.
   */
  googleLinked?: boolean;
}

/** Dùng: `method(@CurrentUser() user: CurrentUserInfo) {}` để lấy user hiện tại. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserInfo => {
    return ctx.switchToHttp().getRequest<{ user: CurrentUserInfo }>().user;
  },
);
