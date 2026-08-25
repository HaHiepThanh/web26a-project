/**
 * Kiểu hiển thị cho hai màn "Manage Workspace" (Settings → Manage Workspace).
 *
 * File này TỪNG chứa `CURRENT_USER_ID = 'me'` cùng ba hàm `mock*()` dựng dữ liệu
 * bịa, vì màn này viết xong trước khi trang Board tồn tại. Trang Board đã có, nên
 * toàn bộ phần đó đã xoá: dữ liệu giờ lấy từ backend thật qua `ManageWorkspaceStore`
 * (thành viên board), `OrganizationStore` (vai trò, lời mời), `BoardStore`,
 * `CardStore` và `ListStore`.
 *
 * ⚠️ VAI TRÒ Ở MÀN NÀY LÀ VAI TRÒ TRONG TỔ CHỨC, không phải trong từng board.
 *    `board_members` chỉ có `(board_id, user_id)` — KHÔNG có cột role; nó là danh
 *    sách "ai được xem board riêng tư", không phải bảng phân quyền. Vai trò thật
 *    nằm ở `organization_members` với đúng ba giá trị owner/admin/member (bảng
 *    phân quyền đầy đủ ở `schema.md`). Bản mock cũ khai thêm `'observer'` —
 *    database không có giá trị đó, nên đã bỏ hẳn thay vì ánh xạ bừa sang
 *    `member`: hiện một vai trò mà hệ thống không thi hành được là nói dối
 *    người dùng. Vì thế mọi kiểu dưới đây dùng thẳng `Role` của tổ chức.
 */
import type { Role } from '../../../models';

/** Đủ để vẽ một avatar trong dãy avatar chồng nhau ở thẻ project. */
export interface ProjectMemberBrief {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

/** Một thẻ project ở màn danh sách. */
export interface ProjectSummary {
  id: string;
  name: string;
  workspaceName: string;
  /** Vai trò của TÔI trong tổ chức chứa board này. null = chưa nạp xong. */
  myRole: Role | null;
  memberCount: number;
  /** Chỉ vài người đầu — dãy avatar, không phải danh sách đầy đủ. */
  memberPreview: ProjectMemberBrief[];
}

/** Thẻ đang giao cho một người, trong đúng board đang xem. */
export interface AssignedCard {
  id: string;
  title: string;
  listName: string;
  dueDate: string | null;
}

/** Một dòng trong bảng thành viên của màn chi tiết. */
export interface ProjectMember {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  /**
   * Vai trò trong tổ chức. `null` = có quyền xem board nhưng không còn trong
   * `organization_members` — hiếm, nhưng vẽ badge "Member" cho họ là sai.
   */
  role: Role | null;
  assignedCards: AssignedCard[];
}

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

const ROLE_BADGES: Record<Role, string> = {
  owner: 'badge-warning badge-soft',
  admin: 'badge-primary badge-soft',
  member: 'badge-success badge-soft',
};

export function roleLabel(role: Role | null): string {
  return role ? ROLE_LABELS[role] : 'Not in organization';
}

export function roleBadge(role: Role | null): string {
  return role ? ROLE_BADGES[role] : 'badge-ghost';
}

/**
 * Vai trò gán được cho người khác qua giao diện.
 *
 * KHÔNG có `owner`: mỗi tổ chức chỉ được đúng 1 owner (unique index
 * `uniq_org_single_owner`), chuyển quyền owner phải hạ owner cũ xuống admin
 * trong cùng một transaction — đó là việc của màn quản lý tổ chức, không phải
 * của màn cài đặt project này.
 */
export const ASSIGNABLE_ROLES: readonly Role[] = ['admin', 'member'];
