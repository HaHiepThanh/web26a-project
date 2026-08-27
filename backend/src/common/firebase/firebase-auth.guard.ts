import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { FirebaseAdminService } from './firebase-admin.service';
import type { CurrentUserInfo } from './current-user.decorator';

/**
 * Tài khoản trong token này có liên kết Google không?
 *
 * `firebase.identities` liệt kê MỌI nhà cung cấp đã nối vào tài khoản, ví dụ
 * `{ "google.com": ["1078..."], "email": ["a@b.com"] }`.
 *
 * ⚠️ KHÔNG dùng `firebase.sign_in_provider` cho việc này. Claim đó chỉ nói lần
 *    đăng nhập NÀY đi bằng đường nào — người đăng nhập bằng mật khẩu rồi mới
 *    nối Google sau sẽ có `sign_in_provider = 'password'`, đọc nhầm claim là
 *    kết luận sai rằng họ chưa nối.
 */
function coNoiGoogle(decoded: DecodedIdToken): boolean {
  const ids = decoded.firebase?.identities as
    | Record<string, unknown>
    | undefined;
  const google = ids?.['google.com'];
  // Firebase trả về mảng id (một tài khoản có thể nối nhiều id cùng provider).
  // Mảng rỗng nghĩa là không nối, nên phải xét độ dài chứ không chỉ tồn tại.
  return Array.isArray(google) ? google.length > 0 : !!google;
}

/**
 * Guard xác thực chính: đọc 'Authorization: Bearer <idToken>', verify bằng Firebase,
 * rồi gắn req.user. Mọi route (trừ public) nên dùng guard này.
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);

  constructor(private readonly firebase: FirebaseAdminService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: CurrentUserInfo }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing Authorization header: Bearer <idToken>',
      );
    }

    const idToken = header.slice('Bearer '.length).trim();
    if (!idToken) throw new UnauthorizedException('Bearer token is empty');

    try {
      const decoded = await this.firebase.verifyIdToken(idToken);
      req.user = {
        uid: decoded.uid,
        email: decoded.email,
        displayName: decoded.name,
        avatarUrl: decoded.picture,
        googleLinked: coNoiGoogle(decoded),
      };
      return true;
    } catch (err) {
      // Ghi log chi tiết cho dev, nhưng CHỈ trả 401 chung chung cho client:
      // thông báo cụ thể ("token hết hạn" / "sai chữ ký") giúp kẻ tấn công dò tìm.
      this.logger.warn(`Verify ID token thất bại: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
