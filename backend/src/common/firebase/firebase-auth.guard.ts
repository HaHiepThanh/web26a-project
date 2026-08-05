import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FirebaseAdminService } from './firebase-admin.service';

/**
 * Guard xác thực chính: đọc 'Authorization: Bearer <idToken>', verify bằng Firebase,
 * rồi gắn req.user = { uid, email }. Mọi route (trừ public) nên dùng guard này.
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(private readonly firebase: FirebaseAdminService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Thiếu Bearer token');
    }
    const idToken = header.slice('Bearer '.length);

    // TODO: verify token, gán req.user; ném UnauthorizedException nếu token sai/hết hạn.
    const decoded = await this.firebase.verifyIdToken(idToken);
    req.user = { uid: decoded.uid, email: decoded.email };
    return true;
  }
}
