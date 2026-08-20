import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, Role } from './roles.decorator';

/**
 * Kiểm tra role của user trong TỔ CHỨC hiện tại (chạy SAU FirebaseAuthGuard).
 * Dùng cho hành động nhạy cảm: đổi vai trò, xoá thành viên, mời người, xoá board.
 *
 * 🚧 CHƯA LÀM — đây là việc của Huy (xem docs/HUY.md, bước 8).
 *    Hiện `return true` vô điều kiện, nghĩa là mọi route gắn @Roles ĐANG KHÔNG
 *    được bảo vệ: ai đăng nhập cũng gọi được.
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

    // TODO(Huy): từ req.user.uid + orgId (lấy ở param/body) -> query
    //            organization_members lấy role thật, so với `required`,
    //            không đủ quyền thì ném ForbiddenException (403).
    return true;
  }
}
