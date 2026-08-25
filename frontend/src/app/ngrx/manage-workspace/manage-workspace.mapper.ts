import type { ApiBoardMember } from '../../models';
import type { BoardMemberView } from './manage-workspace.state';

/**
 * `ApiBoardMember` → `BoardMemberView`.
 *
 * Backend dùng `null` cho "không có giá trị", còn `User` trong frontend dùng
 * `undefined` (trường optional). Đổi ở đây một lần để template không phải viết
 * `?? undefined` rải rác.
 */
export function toBoardMemberView(r: ApiBoardMember): BoardMemberView {
  return {
    userId: r.userId,
    user: r.user
      ? {
          id: r.user.id,
          email: r.user.email,
          displayName: r.user.displayName ?? undefined,
          avatarUrl: r.user.avatarUrl ?? undefined,
        }
      : null,
  };
}
