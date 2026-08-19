import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import {
  Organization,
  OrgInvite,
  loadActiveOrgId,
  loadAllInvites,
  loadOrgRegistry,
  loadOrganizationsForUser,
  loadPendingInvitesForUser,
  persistActiveOrgId,
  saveAllInvites,
  upsertOrganization,
} from '../mocks';

/** Quản lý Organization (multi-tenant kiểu Supabase) của user đang đăng nhập —
 *  1 user thuộc nhiều Organization, 1 Organization có nhiều thành viên (mời qua
 *  UUID, phải được đồng ý mới vào). Mỗi Organization có Workspace/Board riêng
 *  biệt (xem mocks/workspace.mock.ts: storage key Workspace tách theo orgId).
 *
 *  Vì đây là app mock không có backend thật, "gửi lời mời" được lưu ở 1
 *  localStorage key dùng chung cho cả trình duyệt (`trello_org_invites`) và
 *  đồng bộ realtime giữa các tab/cửa sổ CÙNG trình duyệt qua sự kiện `storage`
 *  — đây là cách duy nhất để 2 tài khoản "nhìn thấy nhau" mà không cần server.
 *  Muốn test với 2 tài khoản: mở 2 tab/cửa sổ của CÙNG 1 trình duyệt (vd 2 cửa
 *  sổ Chrome bình thường, hoặc 1 cửa sổ thường + 1 cửa sổ ẩn danh CÙNG trình
 *  duyệt) trỏ vào cùng localhost:4200, đăng nhập 2 tài khoản khác nhau. */
@Injectable({ providedIn: 'root' })
export class OrganizationService {
  private readonly auth = inject(AuthService);

  readonly organizations = signal<Organization[]>([]);
  readonly activeOrgId = signal<string | null>(null);
  readonly myInvites = signal<OrgInvite[]>([]);
  /** Toàn bộ lời mời (mọi Organization) — để modal quản lý hiện danh sách "đang chờ
   *  đồng ý" của tổ chức đang mở, biết ai đã được mời mà chưa vào. */
  readonly allInvites = signal<OrgInvite[]>([]);

  readonly activeOrg = computed(() => this.organizations().find((o) => o.id === this.activeOrgId()) ?? null);
  readonly pendingInviteCount = computed(() => this.myInvites().length);

  constructor() {
    // Nạp lại Organization + lời mời mỗi khi user đăng nhập/đăng xuất/đổi tài khoản.
    effect(() => {
      const userId = this.auth.currentUser()?.id;
      if (!userId) {
        this.organizations.set([]);
        this.activeOrgId.set(null);
        this.myInvites.set([]);
        return;
      }
      this.reload(userId);
    });

    // Đồng bộ realtime giữa các tab cùng trình duyệt: khi tab khác (vd tài
    // khoản B) ghi lời mời/Organization mới vào localStorage, tab này cập nhật
    // ngay không cần F5 — đây là cách duy nhất để mô phỏng "nhận thông báo" mà
    // không có server thật đứng giữa.
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e: StorageEvent) => {
        if (!e.key) return;
        if (e.key === 'trello_org_invites' || e.key === 'trello_org_registry') {
          const userId = this.auth.currentUser()?.id;
          if (userId) this.reload(userId);
        }
      });
    }
  }

  private reload(userId: string): void {
    const orgs = loadOrganizationsForUser(userId);
    this.organizations.set(orgs);
    const active = loadActiveOrgId(userId, orgs);
    this.activeOrgId.set(active);
    this.myInvites.set(loadPendingInvitesForUser(userId));
    this.allInvites.set(loadAllInvites());
  }

  /** Lời mời đang chờ đồng ý của 1 Organization (dùng cho modal quản lý thành viên). */
  pendingInvitesFor(orgId: string): OrgInvite[] {
    return this.allInvites().filter((i) => i.orgId === orgId && i.status === 'pending');
  }

  /** Huỷ 1 lời mời chưa được trả lời. */
  cancelInvite(inviteId: string): void {
    const invites = loadAllInvites().filter((i) => i.id !== inviteId);
    saveAllInvites(invites);
    this.allInvites.set(invites);
  }

  switchOrg(orgId: string): void {
    const userId = this.auth.currentUser()?.id;
    if (!userId || !this.organizations().some((o) => o.id === orgId)) return;
    this.activeOrgId.set(orgId);
    persistActiveOrgId(userId, orgId);
  }

  createOrg(name: string, icon?: string): Organization | null {
    const userId = this.auth.currentUser()?.id;
    if (!userId) return null;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 50) return null;

    const org: Organization = {
      id: `org-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: trimmed,
      icon: icon?.trim() || '🏢',
      ownerId: userId,
      memberIds: [userId],
      createdAt: new Date().toISOString(),
    };
    upsertOrganization(org);
    this.organizations.set([...this.organizations(), org]);
    this.switchOrg(org.id);
    return org;
  }

  /** Mời 1 user (theo UUID) vào Organization đang chọn. Trả về thông báo lỗi
   *  (string) nếu không mời được, hoặc null nếu gửi lời mời thành công. */
  inviteMemberByUuid(orgId: string, targetUuid: string): string | null {
    const me = this.auth.currentUser();
    if (!me) return 'Bạn cần đăng nhập.';
    const org = this.organizations().find((o) => o.id === orgId);
    if (!org) return 'Không tìm thấy Organization.';

    const target = this.auth.findUserByUuid(targetUuid);
    if (!target) return 'Không tìm thấy người dùng với UUID này.';
    if (target.id === me.id) return 'Bạn không thể tự mời chính mình.';
    if (org.memberIds.includes(target.id)) return `${target.displayName ?? target.email} đã là thành viên rồi.`;

    const invites = loadAllInvites();
    const already = invites.some((i) => i.orgId === orgId && i.toUserId === target.id && i.status === 'pending');
    if (already) return `Đã gửi lời mời cho ${target.displayName ?? target.email} trước đó rồi.`;

    const invite: OrgInvite = {
      id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      orgId: org.id,
      orgName: org.name,
      orgIcon: org.icon,
      toUserId: target.id,
      fromUserId: me.id,
      fromUserName: me.displayName ?? me.email,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    const updated = [...invites, invite];
    saveAllInvites(updated);
    this.allInvites.set(updated);
    return null;
  }

  /** Trả lời lời mời (đồng ý/từ chối). Khi đồng ý, user được thêm vào
   *  memberIds của Organization và ngay lập tức thấy chung Workspace/Board. */
  respondInvite(inviteId: string, accept: boolean): void {
    const userId = this.auth.currentUser()?.id;
    if (!userId) return;

    const invites = loadAllInvites();
    const invite = invites.find((i) => i.id === inviteId);
    if (!invite || invite.toUserId !== userId || invite.status !== 'pending') return;

    invite.status = accept ? 'accepted' : 'declined';
    saveAllInvites(invites);

    if (accept) {
      this.addMemberToOrg(invite.orgId, userId);
    }

    this.reload(userId);
  }

  /** Đổi tên/icon Organization — chỉ chủ sở hữu mới được đổi. */
  updateOrg(orgId: string, changes: { name?: string; icon?: string }): string | null {
    const me = this.auth.currentUser();
    if (!me) return 'Bạn cần đăng nhập.';
    const registry = loadOrgRegistry();
    const org = registry[orgId];
    if (!org) return 'Không tìm thấy Organization.';
    if (org.ownerId !== me.id) return 'Chỉ Trưởng nhóm mới được chỉnh sửa tổ chức.';

    const name = changes.name?.trim();
    if (name !== undefined && !name) return 'Tên tổ chức không được để trống.';
    if (name !== undefined && name.length > 50) return 'Tên tổ chức tối đa 50 ký tự.';
    upsertOrganization({ ...org, name: name || org.name, icon: changes.icon?.trim() || org.icon });
    this.reload(me.id);
    return null;
  }

  /** Xoá 1 thành viên khỏi Organization (không cho xoá Owner). Trả về thông báo
   *  lỗi (string) nếu không xoá được, hoặc null nếu xoá thành công. */
  removeMember(orgId: string, userId: string): string | null {
    const me = this.auth.currentUser();
    if (!me) return 'Bạn cần đăng nhập.';
    const registry = loadOrgRegistry();
    const org = registry[orgId];
    if (!org) return 'Không tìm thấy Organization.';
    if (userId === org.ownerId) return 'Không thể xoá Trưởng nhóm (Owner) của Organization.';

    org.memberIds = org.memberIds.filter((id) => id !== userId);
    upsertOrganization(org);
    this.reload(me.id);
    return null;
  }

  private addMemberToOrg(orgId: string, userId: string): void {
    const registry = loadOrgRegistry();
    const org = registry[orgId];
    if (!org) return;
    if (!org.memberIds.includes(userId)) {
      org.memberIds = [...org.memberIds, userId];
      upsertOrganization(org);
    }
  }
}
