import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, Role } from './roles.decorator';

/**
 * Kiểm tra role của user trong tenant hiện tại (chạy SAU FirebaseAuthGuard).
 * Dùng cho hành động nhạy cảm: xoá board/tenant, đổi role, xoá thành viên (#7).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true; // route không yêu cầu role

    // TODO: từ req.user.uid + tenantId (param/body) -> tra tenant_members lấy role,
    //       so với `required`; ném ForbiddenException nếu không đủ quyền.
    return true;
  }
}
