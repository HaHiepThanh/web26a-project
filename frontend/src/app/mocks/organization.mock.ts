/**
 * Organization (multi-tenant, kiểu Supabase): 1 user thuộc nhiều Organization,
 * 1 Organization có nhiều thành viên (mời qua UUID). Mỗi Organization có
 * Workspace/Board độc lập hoàn toàn với các Organization khác.
 *
 * Khác với bản đầu tiên (mỗi user giữ 1 bản sao Organization riêng), giờ đây
 * Organization được lưu trong 1 "registry" DÙNG CHUNG (không tách theo userId)
 * để nhiều tài khoản có thể cùng là thành viên của 1 Organization và thấy đúng
 * 1 bộ Workspace/Board chung — giống cách Supabase chia sẻ dữ liệu theo tenant.
 */

export interface Organization {
  id: string;
  name: string;
  icon: string; // emoji
  ownerId: string; // userId đã tạo Organization này
  memberIds: string[]; // toàn bộ thành viên hiện có (bao gồm ownerId)
  createdAt: string;
}

export type OrgInviteStatus = 'pending' | 'accepted' | 'declined';

export interface OrgInvite {
  id: string;
  orgId: string;
  orgName: string;
  orgIcon: string;
  toUserId: string;
  fromUserId: string;
  fromUserName: string;
  status: OrgInviteStatus;
  createdAt: string;
}

const STORAGE_KEY_ORG_REGISTRY = 'trello_org_registry'; // dùng chung mọi tài khoản trên trình duyệt này
const STORAGE_KEY_ACTIVE_ORG = 'trello_active_org'; // riêng theo từng user (chỉ là lựa chọn hiển thị)
const STORAGE_KEY_ORG_INVITES = 'trello_org_invites'; // dùng chung — để tài khoản B thấy lời mời từ tài khoản A

function activeOrgKeyFor(userId: string): string {
  return `${STORAGE_KEY_ACTIVE_ORG}_${userId}`;
}

function defaultOrganization(userId: string): Organization {
  return {
    id: `org-default-${userId}`,
    name: 'Tổ chức của tôi',
    icon: '🏢',
    ownerId: userId,
    memberIds: [userId],
    createdAt: new Date().toISOString(),
  };
}

/** Đọc toàn bộ registry Organization (dùng chung mọi tài khoản trên trình duyệt này). */
export function loadOrgRegistry(): Record<string, Organization> {
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ORG_REGISTRY);
      if (saved) return JSON.parse(saved);
    } catch {}
  }
  return {};
}

export function saveOrgRegistry(registry: Record<string, Organization>): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_ORG_REGISTRY, JSON.stringify(registry));
    } catch {}
  }
}

export function upsertOrganization(org: Organization): void {
  const registry = loadOrgRegistry();
  registry[org.id] = org;
  saveOrgRegistry(registry);
}

/** Danh sách Organization mà 1 user là thành viên — user chưa từng có Organization
 *  nào sẽ tự được cấp 1 Organization mặc định (trống, chưa có Workspace). */
export function loadOrganizationsForUser(userId: string): Organization[] {
  const registry = loadOrgRegistry();
  const mine = Object.values(registry).filter((o) => o.memberIds?.includes(userId));
  if (mine.length > 0) return mine;

  const initial = defaultOrganization(userId);
  upsertOrganization(initial);
  return [initial];
}

/** Organization đang chọn — nhớ qua các lần tải lại trang; nếu id đã lưu không còn
 *  tồn tại (vd đã bị xoá / bị mất quyền) thì rơi về Organization đầu tiên. */
export function loadActiveOrgId(userId: string, orgs: Organization[]): string {
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem(activeOrgKeyFor(userId));
      if (saved && orgs.some((o) => o.id === saved)) return saved;
    } catch {}
  }
  return orgs[0]?.id ?? '';
}

export function persistActiveOrgId(userId: string, orgId: string): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(activeOrgKeyFor(userId), orgId);
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// Lời mời tham gia Organization — lưu chung (không tách theo user) để tài
// khoản được mời (kể cả đang mở ở trình duyệt/tab khác cùng máy) có thể thấy.
// ---------------------------------------------------------------------------

export function loadAllInvites(): OrgInvite[] {
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ORG_INVITES);
      if (saved) return JSON.parse(saved);
    } catch {}
  }
  return [];
}

export function saveAllInvites(list: OrgInvite[]): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_ORG_INVITES, JSON.stringify(list));
    } catch {}
  }
}

export function loadPendingInvitesForUser(userId: string): OrgInvite[] {
  return loadAllInvites().filter((i) => i.toUserId === userId && i.status === 'pending');
}
