import type { Organization, OrgInvite } from '../../mocks';
import type {
  ApiMyInvite,
  ApiMyOrg,
  ApiOrgMember,
  ApiPendingInvite,
  OrgMemberView,
  User,
} from '../../models';

/**
 * Đổi dữ liệu backend sang kiểu dùng trong app.
 *
 * Tách riêng vì đây là phần dễ test nhất: hàm thuần, không đụng store, không
 * inject gì. Một bài test mapper bắt được lỗi lệch tên trường nhanh hơn nhiều so
 * với chạy cả app rồi soi màn hình trắng.
 */

/** Một thành viên kèm thông tin hiển thị. */
export function toOrgMemberView(m: ApiOrgMember): OrgMemberView {
  return {
    role: m.role,
    joinedAt: m.joinedAt,
    user: {
      id: m.userId,
      email: m.user.email,
      displayName: m.user.displayName ?? undefined,
      avatarUrl: m.user.avatarUrl ?? undefined,
    } as User,
  };
}

/**
 * Ghép `GET /organizations` với `GET /organizations/:id/members` thành một
 * `Organization` đủ dùng cho giao diện.
 *
 * Backend không trả `ownerId` và `memberIds` trong danh sách tổ chức, nhưng màn
 * hình cần cả hai (đếm thành viên, biết ai là chủ) — nên suy ra từ danh sách
 * thành viên thay vì thêm một vòng gọi API nữa.
 */
export function toOrganization(o: ApiMyOrg, members: readonly ApiOrgMember[]): Organization {
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    ownerId: members.find((m) => m.role === 'owner')?.userId ?? '',
    memberIds: members.map((m) => m.userId),
    // `GET /organizations` không trả createdAt — giao diện hiện không dùng tới.
    createdAt: '',
  };
}

/** Lời mời gửi TỚI tôi (chuông thông báo). */
export function toMyInvite(i: ApiMyInvite, myUid: string): OrgInvite {
  return {
    id: i.id,
    orgId: i.orgId,
    orgName: i.orgName,
    toUserId: myUid,
    fromUserId: '',
    fromUserName: i.fromUser.displayName || i.fromUser.email,
    role: i.role ?? 'member',
    status: 'pending',
    createdAt: i.createdAt,
  };
}

/**
 * Lời mời ĐÃ GỬI của một tổ chức (modal "Quản lý tổ chức").
 *
 * Lưu ý `fromUserName` ở đây chứa tên người ĐƯỢC MỜI, không phải người gửi —
 * giữ nguyên quy ước cũ của `OrgInvite` để modal không phải sửa. Tên hơi ngược
 * nhưng đổi tên trường là kéo theo cả component, để lần dọn dẹp sau.
 */
export function toPendingInvite(r: ApiPendingInvite): OrgInvite {
  return {
    id: r.id,
    orgId: r.orgId,
    orgName: '',
    toUserId: r.toUserId,
    fromUserId: r.fromUserId,
    fromUserName: r.toUser.displayName || r.toUser.email || r.toUserId,
    role: r.role,
    status: 'pending',
    createdAt: r.createdAt,
  };
}
