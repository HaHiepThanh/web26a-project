import { SetMetadata } from '@nestjs/common';

export type Role = 'owner' | 'member';
export const ROLES_KEY = 'roles';

/** Đánh dấu route cần role cụ thể, vd: `@Roles('owner')` cho xoá board/tenant (#7). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
