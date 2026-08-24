import { withRealtimeHandlers } from '../shared/realtime.feature';
import type { OrgInvite } from '../../mocks';
import type { OrgInviteRole } from '../../models';

/** Hình dạng `data` của sự kiện `invite.created` do backend gửi xuống. */
interface InviteCreatedPayload {
  id: string;
  orgId: string;
  orgName: string;
  role: OrgInviteRole;
  fromUser: { displayName: string | null; email: string };
  createdAt: string;
}

/** Những gì `OrganizationStore` cần từ luồng WebSocket. */
interface OrgRealtimeTarget {
  applyRemoteInvite(invite: OrgInvite): void;
  removeInviteLocally(inviteId: string): void;
  refreshAfterMembershipChange(): Promise<void>;
}

/**
 * Đăng ký handler cho các sự kiện tổ chức.
 *
 * Ba sự kiện này đi qua phòng riêng `user:<uid>` chứ không phải phòng board —
 * người được mời có thể đang ngồi ở Dashboard và chưa thuộc tổ chức nào, không
 * có board nào để vào.
 *
 * ⚠️ Đăng ký ở đây thì phải XOÁ ba nhánh tương ứng trong `switch` của
 *    `realtime.service.ts`. Để cả hai là sự kiện bị áp hai lần: lời mời hiện
 *    hai dòng trong chuông, và `reload()` chạy hai lượt.
 */
export function withOrganizationRealtime() {
  return withRealtimeHandlers((store: OrgRealtimeTarget) => ({
    user: {
      'invite.created': (data: never, event) => {
        const r = data as unknown as InviteCreatedPayload;
        store.applyRemoteInvite({
          id: r.id,
          orgId: r.orgId,
          orgName: r.orgName,
          toUserId: '',
          fromUserId: event.actorId,
          fromUserName: r.fromUser?.displayName || r.fromUser?.email || 'Ai đó',
          role: r.role ?? 'member',
          status: 'pending',
          createdAt: r.createdAt,
        });
      },

      // Người ta đã trả lời ở nơi khác → gỡ khỏi chuông và nạp lại danh sách
      // thành viên (người gửi lời mời cần thấy họ xuất hiện trong tổ chức).
      'invite.responded': (data: never) => {
        store.removeInviteLocally((data as unknown as { id: string }).id);
        void store.refreshAfterMembershipChange();
      },

      'member.removed': () => {
        void store.refreshAfterMembershipChange();
      },
    },
  }));
}
