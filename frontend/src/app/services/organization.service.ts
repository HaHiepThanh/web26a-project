import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { describeError } from './api-error.util';
import { OrgInvite, loadActiveOrgId, persistActiveOrgId } from '../mocks';
import type { Organization } from '../mocks';
import {
  ApiCreatedOrg,
  ApiMyInvite,
  ApiMyOrg,
  ApiOrgMember,
  ApiPendingInvite,
  OrgInviteRole,
  OrgMemberView,
  User,
} from '../models';
/**
 * Quản lý Organization của user đang đăng nhập — GỌI BACKEND THẬT.
 *
 * Trước đây service này đọc/ghi localStorage (mock). Nay mọi thao tác đi qua
 * NestJS: `ApiService` tự gắn Firebase ID token vào header, backend verify token
 * rồi mới cho đụng dữ liệu.
 *
 * ⚠️ Hệ quả quan trọng: mọi thao tác giờ là BẤT ĐỒNG BỘ. Component nào gọi
 *    `createOrg`/`removeMember`/... đều phải `await`. Guard phải `await ensureLoaded()`
 *    trước khi đọc `organizations()`, nếu không sẽ thấy mảng rỗng ở lần tải trang
 *    đầu và đá người đã đăng nhập về /onboarding.
 *
 * `activeOrgId` vẫn giữ ở localStorage — đó chỉ là lựa chọn hiển thị của từng
 * máy, không phải dữ liệu nghiệp vụ, không cần đẩy lên server.
 */
@Injectable({ providedIn: 'root' })
export class OrganizationService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly organizations = signal<Organization[]>([]);
  readonly activeOrgId = signal<string | null>(null);
  readonly myInvites = signal<OrgInvite[]>([]);
  /** Lời mời ĐÃ GỬI của từng tổ chức (khác `myInvites` — lời mời gửi TỚI tôi). */
  private readonly pendingByOrg = signal<Record<string, OrgInvite[]>>({});

  /** Thành viên từng tổ chức, khoá theo orgId. Nạp kèm lúc tải danh sách tổ chức. */
  readonly membersByOrg = signal<Record<string, OrgMemberView[]>>({});

  /** Vai trò của TÔI trong từng tổ chức — dùng để ẩn/hiện nút, không phải để bảo mật. */
  readonly myRoleByOrg = signal<Record<string, 'owner' | 'admin' | 'member'>>({});

  readonly loading = signal(false);
  /** Lỗi mạng/máy chủ ở lần nạp gần nhất — để trang hiện banner thay vì im lặng. */
  readonly loadError = signal<string | null>(null);

  readonly activeOrg = computed(
    () => this.organizations().find((o) => o.id === this.activeOrgId()) ?? null,
  );
  readonly pendingInviteCount = computed(() => this.myInvites().length);
  readonly activeOrgSlug = computed(() => this.activeOrg()?.slug ?? '');

  /** Vai trò của tôi trong tổ chức đang chọn. */
  readonly myRole = computed(() => {
    const id = this.activeOrgId();
    return id ? (this.myRoleByOrg()[id] ?? null) : null;
  });
  readonly isOwner = computed(() => this.myRole() === 'owner');
  readonly isAdminOrOwner = computed(() => this.myRole() === 'owner' || this.myRole() === 'admin');

  /** Chống gọi trùng: nhiều guard chạy cùng lúc chỉ nạp 1 lần. */
  private loadPromise: Promise<void> | null = null;
  private loadedForUid: string | null = null;

  constructor() {
    // Đổi tài khoản → nạp lại. Đăng xuất → dọn sạch state, không để dữ liệu
    // người trước sót lại trên màn hình người sau.
    effect(() => {
      const uid = this.auth.currentUser()?.id ?? null;
      if (!uid) {
        this.loadPromise = null;
        this.loadedForUid = null;
        this.organizations.set([]);
        this.activeOrgId.set(null);
        this.myInvites.set([]);
        this.membersByOrg.set({});
        this.myRoleByOrg.set({});
        return;
      }
      if (uid !== this.loadedForUid) void this.ensureLoaded();
    });
  }

  /**
   * Bảo đảm dữ liệu đã nạp xong. Guard PHẢI await hàm này.
   *
   * Gọi nhiều lần cùng lúc vẫn chỉ tạo đúng 1 request nhờ cache promise —
   * ba guard chạy nối tiếp nhau trên một route sẽ không gọi API ba lần.
   */
  async ensureLoaded(): Promise<void> {
    const uid = this.auth.currentUser()?.id ?? null;
    if (!uid) return;
    if (this.loadedForUid === uid && this.loadPromise) return this.loadPromise;

    this.loadedForUid = uid;
    this.loadPromise = this.fetchFromServer(uid);
    return this.loadPromise;
  }

  /** Ép nạp lại từ server, bỏ qua cache. Gọi sau khi tạo/xoá/đổi dữ liệu. */
  async reload(): Promise<void> {
    const uid = this.auth.currentUser()?.id ?? null;
    if (!uid) return;
    this.loadedForUid = uid;
    this.loadPromise = this.fetchFromServer(uid);
    return this.loadPromise;
  }

  private async fetchFromServer(uid: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      // Hai request này độc lập nhau → chạy song song cho nhanh.
      const [apiOrgs, apiInvites] = await Promise.all([
        this.api.get<ApiMyOrg[]>('/organizations'),
        this.api.get<ApiMyInvite[]>('/organizations/invites/me').catch(() => [] as ApiMyInvite[]),
      ]);

      // Backend không trả memberIds/ownerId trong GET /organizations, mà giao diện
      // đang cần cả hai (đếm thành viên, kiểm tra ai là chủ). Lấy thêm bằng cách
      // gọi /members cho từng tổ chức — song song, không nối tiếp.
      const memberLists = await Promise.all(
        apiOrgs.map((o) =>
          this.api
            .get<ApiOrgMember[]>(`/organizations/${o.id}/members`)
            .catch(() => [] as ApiOrgMember[]),
        ),
      );

      const membersMap: Record<string, OrgMemberView[]> = {};
      const roleMap: Record<string, 'owner' | 'admin' | 'member'> = {};
      const orgs: Organization[] = apiOrgs.map((o, i) => {
        const members = memberLists[i];
        membersMap[o.id] = members.map((m) => ({
          role: m.role,
          joinedAt: m.joinedAt,
          user: {
            id: m.userId,
            email: m.user.email,
            displayName: m.user.displayName ?? undefined,
            avatarUrl: m.user.avatarUrl ?? undefined,
          } as User,
        }));
        roleMap[o.id] = o.role;
        return {
          id: o.id,
          name: o.name,
          slug: o.slug,
          ownerId: members.find((m) => m.role === 'owner')?.userId ?? '',
          memberIds: members.map((m) => m.userId),
          // GET /organizations không trả createdAt — giao diện hiện không dùng tới.
          createdAt: '',
        };
      });

      this.organizations.set(orgs);
      this.membersByOrg.set(membersMap);
      this.myRoleByOrg.set(roleMap);
      this.myInvites.set(
        apiInvites.map((i) => ({
          id: i.id,
          orgId: i.orgId,
          orgName: i.orgName,
          toUserId: uid,
          fromUserId: '',
          fromUserName: i.fromUser.displayName || i.fromUser.email,
          role: i.role ?? 'member',
          status: 'pending' as const,
          createdAt: i.createdAt,
        })),
      );

      // Giữ lựa chọn cũ nếu tổ chức đó vẫn còn, không thì lấy cái đầu tiên.
      const saved = loadActiveOrgId(uid, orgs);
      const valid = orgs.some((o) => o.id === saved) ? saved : (orgs[0]?.id ?? null);
      this.activeOrgId.set(valid);
      if (valid && valid !== saved) persistActiveOrgId(uid, valid);
    } catch (e) {
      // Không xoá dữ liệu đang có: mất mạng chốc lát mà xoá sạch màn hình thì
      // tệ hơn là hiển thị dữ liệu hơi cũ kèm banner báo lỗi.
      this.loadError.set(describeError(e, 'Failed to load organizations.'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Thành viên (kèm tên/email) của 1 tổ chức. Rỗng nếu chưa nạp xong. */
  membersOf(orgId: string | null): OrgMemberView[] {
    return orgId ? (this.membersByOrg()[orgId] ?? []) : [];
  }

  switchOrg(orgId: string): void {
    const uid = this.auth.currentUser()?.id;
    if (!uid || !this.organizations().some((o) => o.id === orgId)) return;
    this.activeOrgId.set(orgId);
    persistActiveOrgId(uid, orgId);
  }

  /** Tra tổ chức theo slug trên URL. Trả null nếu không thuộc tổ chức đó → 404. */
  orgBySlug(slug: string): Organization | null {
    return this.organizations().find((o) => o.slug === slug) ?? null;
  }

  /* ---------------------------------------------------------------- *
   * Thao tác ghi — đều gọi backend rồi nạp lại
   * ---------------------------------------------------------------- */

  /**
   * Tạo tổ chức mới. Trả về `{ org }` khi thành công, `{ loi }` khi hỏng.
   *
   * Không tự kiểm tra slug trùng ở client nữa: backend là nơi duy nhất biết chắc,
   * và nó đã trả 409 kèm câu tiếng Việt sẵn.
   */
  async createOrg(name: string, slug: string): Promise<{ org?: Organization; error?: string }> {
    try {
      const kq = await this.api.post<ApiCreatedOrg>('/organizations', {
        name: name.trim(),
        slug: slug.trim(),
      });
      await this.reload();
      const org = this.organizations().find((o) => o.id === kq.id) ?? null;
      if (org) this.switchOrg(org.id);
      return { org: org ?? undefined };
    } catch (e) {
      return { error: describeError(e, 'Failed to create organization.') };
    }
  }

  /** Mời 1 user vào tổ chức theo uid. Trả về thông báo lỗi, hoặc null nếu thành công. */
  async inviteMember(
    orgId: string,
    toUserId: string,
    role: OrgInviteRole = 'member',
  ): Promise<string | null> {
    const me = this.auth.currentUser();
    if (!me) return 'You need to sign in.';
    if (toUserId === me.id) return 'You cannot invite yourself.';
    try {
      await this.api.post(`/organizations/${orgId}/invites`, {
        toUserId: toUserId.trim(),
        // Quyền này chỉ có hiệu lực KHI người ta bấm Đồng ý — backend đọc lại
        // `organization_invites.role` lúc đó, không phải lúc gửi.
        role,
      });
      return null;
    } catch (e) {
      return describeError(e, 'Failed to send invite.');
    }
  }

  /**
   * Nhét 1 lời mời vừa nhận qua WebSocket vào chuông thông báo — KHÔNG gọi API.
   *
   * Sự kiện đã mang sẵn tên tổ chức và tên người mời nên vẽ được ngay; gọi lại
   * `GET /organizations/invites/me` chỉ để lấy hai cái tên đó là thừa một vòng
   * mạng, mà đúng lúc người dùng đang nhìn vào chuông.
   *
   * Chống trùng theo id: mở hai tab thì cả hai cùng nhận, mỗi tab tự lọc.
   */
  applyRemoteInvite(invite: OrgInvite): void {
    this.myInvites.update((all) =>
      all.some((i) => i.id === invite.id) ? all : [invite, ...all],
    );
  }

  /** Lời mời vừa được trả lời ở nơi khác (tab khác) → bỏ khỏi chuông. */
  removeInviteLocally(inviteId: string): void {
    this.myInvites.update((all) => all.filter((i) => i.id !== inviteId));
  }

  /** Bị gỡ khỏi 1 tổ chức → nạp lại toàn bộ, tổ chức đó biến mất khỏi bộ chuyển. */
  async refreshAfterMembershipChange(): Promise<void> {
    await this.reload();
  }

  /** Đồng ý / từ chối lời mời. Trả về thông báo lỗi, hoặc null nếu thành công. */
  async respondInvite(inviteId: string, accept: boolean): Promise<string | null> {
    try {
      await this.api.patch(`/organizations/invites/${inviteId}`, { accept });
      await this.reload();
      return null;
    } catch (e) {
      return describeError(e, 'Failed to respond to invite.');
    }
  }

  /** Xoá 1 thành viên khỏi tổ chức (owner/admin). */
  async removeMember(orgId: string, userId: string): Promise<string | null> {
    try {
      await this.api.delete(`/organizations/${orgId}/members/${userId}`);
      await this.reload();
      return null;
    } catch (e) {
      return describeError(e, 'Failed to remove member.');
    }
  }

  /** Đổi vai trò của 1 thành viên (chỉ owner). */
  async changeRole(
    orgId: string,
    userId: string,
    role: 'owner' | 'admin' | 'member',
  ): Promise<string | null> {
    try {
      await this.api.patch(`/organizations/${orgId}/members/${userId}/role`, { role });
      await this.reload();
      return null;
    } catch (e) {
      return describeError(e, 'Failed to change role.');
    }
  }

  /* ---------------------------------------------------------------- *
   * Chưa có endpoint tương ứng ở backend
   * ---------------------------------------------------------------- */

  /**
   * Đổi tên tổ chức — backend CHƯA có `PATCH /organizations/:id`.
   * Trả lỗi rõ ràng thay vì sửa ngầm ở localStorage: sửa ngầm thì người dùng
   * thấy tên mới, F5 một cái là tên cũ quay lại, không hiểu vì sao.
   */
  /** Đổi tên tổ chức. `slug` KHÔNG đổi được — nó nằm trong mọi URL đã lưu/chia sẻ. */
  async updateOrg(orgId: string, changes: { name?: string }): Promise<string | null> {
    const name = changes.name?.trim();
    if (!name) return 'Organization name is required.';
    try {
      await this.api.patch(`/organizations/${orgId}`, { name });
      // Nạp lại để tên mới hiện ở bộ chuyển tổ chức, sidebar và mọi chỗ khác.
      await this.reload();
      return null;
    } catch (e) {
      return describeError(e, 'Failed to rename organization.');
    }
  }

  /**
   * Danh sách lời mời đang chờ của 1 tổ chức — backend CHƯA có endpoint này
   * (`GET /organizations/invites/me` chỉ trả lời mời gửi cho CHÍNH TÔI).
   */
  /**
   * Lời mời tổ chức ĐÃ GỬI mà chưa ai trả lời.
   *
   * Đọc từ cache `pendingByOrg`; gọi `loadPendingInvites(orgId)` để nạp. Tách
   * làm hai bước vì modal "Quản lý tổ chức" mới cần danh sách này — nạp sẵn cho
   * mọi tổ chức ngay lúc đăng nhập là phí request.
   */
  pendingInvitesFor(orgId: string): OrgInvite[] {
    return this.pendingByOrg()[orgId] ?? [];
  }

  /** Nạp lời mời đã gửi của 1 tổ chức (chỉ owner/admin gọi được, người khác nhận 403). */
  async loadPendingInvites(orgId: string): Promise<void> {
    if (!orgId) return;
    try {
      const rows = await this.api.get<ApiPendingInvite[]>(`/organizations/${orgId}/invites`);
      this.pendingByOrg.update((map) => ({
        ...map,
        [orgId]: rows.map((r) => ({
          id: r.id,
          orgId: r.orgId,
          orgName: '',
          toUserId: r.toUserId,
          fromUserId: r.fromUserId,
          // Tên/email người ĐƯỢC MỜI — nếu không có thì modal chỉ hiện được uid.
          fromUserName: r.toUser.displayName || r.toUser.email || r.toUserId,
          role: r.role,
          status: 'pending' as const,
          createdAt: r.createdAt,
        })),
      }));
    } catch {
      // Thành viên thường gọi sẽ nhận 403 — không phải lỗi cần la lên, chỉ là
      // họ không có quyền xem, và modal đã ẩn khối đó rồi.
      this.pendingByOrg.update((map) => ({ ...map, [orgId]: [] }));
    }
  }

  /** Huỷ lời mời — backend CHƯA có `DELETE /organizations/invites/:id`. */
  /** Huỷ lời mời đã gửi. Người ta đã bấm đồng ý rồi thì backend trả 409. */
  async cancelInvite(inviteId: string): Promise<string | null> {
    const orgId = this.activeOrgId();
    try {
      await this.api.delete(`/organizations/invites/${inviteId}`);
      if (orgId) await this.loadPendingInvites(orgId);
      return null;
    } catch (e) {
      return describeError(e, 'Failed to cancel invite.');
    }
  }
}

// Kiểu đã chuyển sang models/ — re-export để chỗ nào còn import từ đây vẫn chạy.
export type { OrgMemberView };
