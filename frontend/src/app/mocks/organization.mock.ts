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

import { slugify, validateSlugFormat } from '../utils/slug.util';

import { Organization, OrgInvite, OrgInviteStatus } from '../models';

// Các kiểu trên đã chuyển sang models/organization.model.ts.
// Re-export để chỗ nào còn import từ đây vẫn chạy.
export type { Organization, OrgInvite, OrgInviteStatus };





const STORAGE_KEY_ORG_REGISTRY = 'trello_org_registry'; // dùng chung mọi tài khoản trên trình duyệt này
const STORAGE_KEY_ACTIVE_ORG = 'trello_active_org'; // riêng theo từng user (chỉ là lựa chọn hiển thị)
const STORAGE_KEY_ORG_INVITES = 'trello_org_invites'; // dùng chung — để tài khoản B thấy lời mời từ tài khoản A

function activeOrgKeyFor(userId: string): string {
  return `${STORAGE_KEY_ACTIVE_ORG}_${userId}`;
}

/** Sinh slug chưa bị chiếm, tự thêm hậu tố -2, -3... nếu trùng. */
export function uniqueSlugFrom(base: string, registry: Record<string, Organization>): string {
  const taken = new Set(Object.values(registry).map((o) => o.slug));
  const root = slugify(base) || 'to-chuc';
  if (!taken.has(root) && !validateSlugFormat(root)) return root;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${root}-${i}`;
    if (!taken.has(candidate) && !validateSlugFormat(candidate)) return candidate;
  }
  return `${root}-${Date.now()}`;
}

/** Đọc toàn bộ registry Organization (dùng chung mọi tài khoản trên trình duyệt này). */
export function loadOrgRegistry(): Record<string, Organization> {
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ORG_REGISTRY);
      if (saved) return migrateMissingSlugs(JSON.parse(saved));
    } catch {}
  }
  return {};
}

/** Tổ chức tạo trước khi có tính năng slug thì không có cột này — cấp bù một slug
 *  từ tên để URL /:orgSlug không vỡ với dữ liệu cũ. Tự ghi lại xuống localStorage. */
function migrateMissingSlugs(registry: Record<string, Organization>): Record<string, Organization> {
  const orgs = Object.values(registry ?? {});
  if (orgs.length === 0 || orgs.every((o) => o?.slug)) return registry;

  const migrated: Record<string, Organization> = { ...registry };
  for (const org of orgs) {
    if (org?.slug) continue;
    migrated[org.id] = { ...org, slug: uniqueSlugFrom(org.name, migrated) };
  }
  saveOrgRegistry(migrated);
  return migrated;
}

export function saveOrgRegistry(registry: Record<string, Organization>): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_ORG_REGISTRY, JSON.stringify(registry));
    } catch {}
  }
}

/** Slug đã có tổ chức khác dùng chưa? (tra trên registry dùng chung của trình duyệt) */
export function isSlugTaken(slug: string, excludeOrgId?: string): boolean {
  return Object.values(loadOrgRegistry()).some((o) => o.slug === slug && o.id !== excludeOrgId);
}

export function findOrgBySlug(slug: string): Organization | null {
  return Object.values(loadOrgRegistry()).find((o) => o.slug === slug) ?? null;
}

export function upsertOrganization(org: Organization): void {
  const registry = loadOrgRegistry();
  registry[org.id] = org;
  saveOrgRegistry(registry);
}

/**
 * Danh sách Organization mà 1 user là thành viên. Trả về MẢNG RỖNG nếu chưa có —
 * `onboardingGuard` sẽ bắt trường hợp đó và đưa user sang trang /onboarding.
 *
 * ⚠️ Trước đây hàm này TỰ TẠO một tổ chức mặc định với slug máy sinh
 * (`to-chuc-cua-toi-8f4c2e`). Đã bỏ, vì slug là VĨNH VIỄN KHÔNG ĐỔI ĐƯỢC —
 * cấp ngầm nghĩa là user bị gán cứng một URL xấu mà họ chưa từng nhìn thấy.
 * Giờ user tự chọn đường dẫn của mình ở màn onboarding.
 */
export function loadOrganizationsForUser(userId: string): Organization[] {
  const registry = loadOrgRegistry();
  return Object.values(registry).filter((o) => o.memberIds?.includes(userId));
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
