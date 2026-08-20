import { SetMetadata } from '@nestjs/common';

/**
 * 3 mức quyền trong 1 tổ chức (khớp CHECK của cột organization_members.role):
 *   owner  — chủ tổ chức, làm được mọi thứ.
 *   admin  — được uỷ quyền: mời/xoá thành viên, tạo/xoá workspace & board.
 *   member — thành viên thường.
 */
export type Role = 'owner' | 'admin' | 'member';
export const ROLES_KEY = 'roles';

/** Đánh dấu route cần role cụ thể, vd: `@Roles('owner', 'admin')`. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
