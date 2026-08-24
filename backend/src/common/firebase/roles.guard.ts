import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SupabaseService } from '../supabase/supabase.service';
import { ROLES_KEY, Role } from './roles.decorator';

/**
 * Kiểm tra role của user trong TỔ CHỨC hiện tại (chạy SAU FirebaseAuthGuard).
 * Dùng cho hành động nhạy cảm: đổi vai trò, xoá thành viên, mời người, xoá board.
 *
 * Thứ tự chạy:
 *   FirebaseAuthGuard  → verify token, gắn req.user = { uid, ... }   ("bạn là ai")
 *   RolesGuard         → tra role thật trong database, so với @Roles ("bạn được làm gì")
 *   Controller
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly supabase: SupabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true; // route không yêu cầu role

    const req = context.switchToHttp().getRequest();
    const uid: string | undefined = req.user?.uid;

    // Không có uid nghĩa là FirebaseAuthGuard chưa chạy (route quên gắn nó).
    // Chặn luôn thay vì cho qua — thà hỏng lộ liễu còn hơn thủng âm thầm.
    if (!uid) {
      throw new ForbiddenException('Could not identify the caller.');
    }

    const orgId = this.resolveOrgId(req);
    if (!orgId) {
      throw new ForbiddenException('Could not determine the organization for this request.');
    }

    const { data, error } = await this.supabase.client
      .from('organization_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', uid)
      .maybeSingle();

    if (error) {
      this.logger.error(`Đọc role thất bại (uid=${uid}, org=${orgId}): ${error.message}`);
      throw new InternalServerErrorException('Failed to check permissions');
    }
    if (!data) {
      throw new ForbiddenException('You are not a member of this organization.');
    }

    const role = data.role as Role;
    if (!required.includes(role)) {
      // Ném exception kèm lời nhắn thay vì `return false`: return false cho ra
      // 403 với message rỗng tuếch, người dùng đọc không hiểu vì sao bị chặn.
      throw new ForbiddenException(
        `This action requires ${required.join(' or ')} permission. You are currently ${role}.`,
      );
    }
    return true;
  }

  /**
   * Tìm orgId của yêu cầu hiện tại.
   *
   * Ba route đang dùng guard này đều có dạng `/organizations/:id/...` nên orgId
   * nằm ở `req.params.id`. Nhưng viết cứng `params.id` thì route sau này đặt tên
   * param khác là hỏng âm thầm — nên tìm theo thứ tự, cái nào có trước thì dùng.
   */
  private resolveOrgId(req: {
    params?: Record<string, string>;
    body?: Record<string, unknown>;
  }): string | undefined {
    return (
      req.params?.id ??
      req.params?.orgId ??
      (typeof req.body?.orgId === 'string' ? req.body.orgId : undefined)
    );
  }
}
