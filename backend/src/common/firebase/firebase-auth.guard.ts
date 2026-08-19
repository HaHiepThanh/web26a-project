import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { FirebaseAdminService } from './firebase-admin.service';
import type { CurrentUserInfo } from './current-user.decorator';

/**
 * Guard xác thực chính: đọc 'Authorization: Bearer <idToken>', verify bằng Firebase,
 * rồi gắn req.user. Mọi route (trừ public) nên dùng guard này.
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);

  constructor(private readonly firebase: FirebaseAdminService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: CurrentUserInfo }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Thiếu header Authorization: Bearer <idToken>');
    }

    const idToken = header.slice('Bearer '.length).trim();
    if (!idToken) throw new UnauthorizedException('Bearer token rỗng');

    try {
      const decoded = await this.firebase.verifyIdToken(idToken);
      req.user = {
        uid: decoded.uid,
        email: decoded.email,
        displayName: decoded.name,
        avatarUrl: decoded.picture,
      };
      return true;
    } catch (err) {
      // Ghi log chi tiết cho dev, nhưng CHỈ trả 401 chung chung cho client:
      // thông báo cụ thể ("token hết hạn" / "sai chữ ký") giúp kẻ tấn công dò tìm.
      this.logger.warn(`Verify ID token thất bại: ${(err as Error).message}`);
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
    }
  }
}
