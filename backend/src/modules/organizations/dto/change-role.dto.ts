import { IsIn } from 'class-validator';

/**
 * Body của PATCH /organizations/:id/members/:userId/role.
 *
 * Chặn giá trị lạ ngay ở DTO. Để nó xuống database thì vỡ CHECK constraint của
 * cột `organization_members.role` → 500, thay vì 400 nói rõ giá trị nào hợp lệ.
 */
export class ChangeRoleDto {
  @IsIn(['owner', 'admin', 'member'], {
    message: 'role must be owner, admin, or member.',
  })
  role: 'owner' | 'admin' | 'member';
}
