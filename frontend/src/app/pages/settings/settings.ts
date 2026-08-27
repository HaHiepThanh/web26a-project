import { Component, computed, effect, inject, signal } from '@angular/core';
import {
  LucideBuilding2,
  LucideGraduationCap,
  LucideUser,
  LucideUsers,
} from '@lucide/angular';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { OrganizationStore } from '../../ngrx/organization/organization.store';
import { TourStore } from '../../ngrx/tour/tour.store';
import { BoardStore } from '../../ngrx/board/board.store';
import {
  Organization,
  OrgInviteRole,
  OrgMemberView,
  Privacy,
  Role,
  User,
  WorkspaceRole,
} from '../../models';
import { NAV_ITEMS, SettingsTab } from './settings.models';
import {
  WorkspaceItem,
  WorkspaceMember,
  WorkspaceWithOrg,
  loadAllWorkspacesForUser,
  loadStoredWorkspaces,
  persistWorkspaces,
} from '../../mocks';
import { ProfileTab } from '../../components/settings/profile-tab/profile-tab';
import { ManageWorkspaceTab } from '../../components/settings/manage-workspace-tab/manage-workspace-tab';
import { ManageOrganizationTab } from '../../components/settings/manage-organization-tab/manage-organization-tab';
import { OrgDeleteModal } from '../../components/workspace/org-delete-modal/org-delete-modal';
import { WorkspaceDeleteModal } from '../../components/workspace/workspace-delete-modal/workspace-delete-modal';
import { WorkspaceFormModal } from '../../components/workspace/workspace-form-modal/workspace-form-modal';
import { WorkspaceService } from '../../services/workspace.service';

@Component({
  selector: 'app-settings',
  imports: [
    LucideBuilding2,
    LucideGraduationCap,
    LucideUser,
    LucideUsers,
    ProfileTab,
    ManageWorkspaceTab,
    ManageOrganizationTab,
    OrgDeleteModal,
    WorkspaceDeleteModal,
    WorkspaceFormModal,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
  host: { class: 'flex flex-1 min-h-0 overflow-hidden' },
})
export class Settings {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  readonly orgService = inject(OrganizationStore);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly boardService = inject(BoardStore);
  private readonly tour = inject(TourStore);
  private readonly router = inject(Router);

  /**
   * Chạy lại tour hướng dẫn từ bước 1.
   *
   * Phải điều hướng về trang workspace: cả bốn neo `data-tour` của tầng 1 đều
   * nằm ở trang workspace và trang board, không có cái nào ở đây. Gọi `restart()`
   * mà đứng lại trang Cài đặt thì overlay đi tìm neo, không thấy, chờ 3 giây rồi
   * bỏ qua từng bước một — tour "chạy" xong trong 12 giây mà không dạy được gì.
   */
  onRestartTour(): void {
    this.tour.restart();
    void this.router.navigate(['/', this.orgService.activeOrgSlug(), 'workspace']);
  }

  /**
   * Xoá lịch sử coach mark để chúng được hiện lại.
   *
   * KHÔNG điều hướng đi đâu cả — coach mark chỉ xuất hiện trên trang Board và tự
   * bật khi gặp đúng hoàn cảnh, không phải thứ chạy được theo yêu cầu như tour.
   * Kéo người dùng sang trang khác rồi để họ ngồi đợi là hứa hão.
   */
  onResetHints(): void {
    this.tour.resetCoachMarks();
  }

  readonly currentUser = this.auth.currentUser;
  readonly searchableUsers = computed(() => {
    const orgId = this.selectedOrgFilter() || this.orgService.activeOrgId();
    if (!orgId) return this.auth.getSearchableUsers();
    const orgMembers = this.orgService.membersOf(orgId).map((m) => m.user);
    const localUsers = this.auth.getSearchableUsers();
    const seen = new Set<string>();
    const combined: User[] = [];
    for (const u of [...orgMembers, ...localUsers]) {
      if (!seen.has(u.id)) {
        seen.add(u.id);
        combined.push(u);
      }
    }
    return combined;
  });

  // ---------------------------------------------------------------------
  // Navigation & Tabs
  // ---------------------------------------------------------------------
  readonly navItems = NAV_ITEMS;
  readonly activeTab = signal<SettingsTab>('profile');
  readonly toastMessage = signal<string | null>(null);
  readonly toastType = signal<'success' | 'info' | 'error'>('success');
  private toastTimer?: ReturnType<typeof setTimeout>;

  flash(msg: string, type: 'success' | 'info' | 'error' = 'success'): void {
    this.toastMessage.set(msg);
    this.toastType.set(type);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastMessage.set(null);
    }, 3000);
  }

  onTabChange(tab: SettingsTab): void {
    this.activeTab.set(tab);
    if (tab === 'manage-workspace') {
      void this.loadWorkspacesForOrganizations();
    }
  }

  // ---------------------------------------------------------------------
  // TAB 1: Profile handlers
  // ---------------------------------------------------------------------
  async onSaveProfile(user: User): Promise<void> {
    try {
      // Gửi cả form — kể cả field đang để trống (`''`) — là ĐÚNG Ý ở đây: người
      // dùng đang nhìn thấy và chủ động sửa toàn bộ form, để trống rồi bấm Lưu
      // nghĩa là họ MUỐN xoá field đó, không phải "chưa đụng tới". Backend
      // (UpdateProfileDto) đã phân biệt "vắng mặt = giữ nguyên" khác "chuỗi
      // rỗng = xoá" nên gửi `''` an toàn, không còn vỡ 400 như trước.
      await this.auth.updateProfile({
        displayName: user.displayName ?? '',
        username: user.username ?? '',
        phone: user.phone ?? '',
        jobTitle: user.jobTitle ?? '',
        avatarUrl: user.avatarUrl ?? '',
      });
      this.flash('Profile updated successfully!');
      await this.onProfileChanged();
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 409) {
        this.flash('This username is already taken — please choose another.', 'error');
        return;
      }
      const detail = (err as { error?: { message?: string | string[] } })?.error?.message;
      this.flash(
        Array.isArray(detail) ? detail[0] : (detail ?? 'Failed to save profile. Please try again.'),
        'error',
      );
    }
  }

  /**
   * Hồ sơ vừa đổi (tên / ảnh) → NẠP LẠI tổ chức để đồng bộ ngay.
   *
   * ⚠️ Không tự mutate state cục bộ: gọi `orgService.reload()` để backend trả về
   * một dòng trong cache: đổi hồ sơ là việc hiếm, còn sửa tay thì phải nhớ mọi
   * chỗ đang giữ bản sao — quên một chỗ là lại lệch y như cũ.
   */
  async onProfileChanged(): Promise<void> {
    await this.orgService.reload();
  }
  // ---------------------------------------------------------------------
  // TAB 2: Manage Workspace handlers
  // ---------------------------------------------------------------------
  readonly selectedOrgFilter = signal<string | null>(null); // null = Tất cả Organization
  readonly workspaces = signal<WorkspaceWithOrg[]>([]);
  readonly selectedWorkspaceId = signal<string | null>(null);

  constructor() {
    void this.boardService.loadAllBoards();

    effect(() => {
      // Theo dõi khi đổi filter hoặc danh sách org thay đổi hoặc allBoards nạp xong
      this.selectedOrgFilter();
      this.orgService.organizations();
      this.boardService.allBoards();

      void this.loadWorkspacesForOrganizations();
    });
  }

  private async loadWorkspacesForOrganizations(): Promise<void> {
    const userId = this.auth.currentUser()?.id;
    const orgFilter = this.selectedOrgFilter();
    const orgs = this.orgService.organizations();
    const allBoards = this.boardService.allBoards();

    if (!orgs.length) {
      this.workspaces.set([]);
      this.selectedWorkspaceId.set(null);
      return;
    }

    const targetOrgs = orgFilter
      ? orgs.filter((o) => o.id === orgFilter)
      : orgs;

    const orgWorkspacePromises = targetOrgs.map(async (org) => {
      try {
        const serverWs = await this.api.get<import('../../models').ApiWorkspace[]>(`/workspaces?orgId=${org.id}`);
        const orgRoster = this.orgService.membersOf(org.id);
        const byId = new Map(orgRoster.map((m) => [m.user.id, m.user]));
        const localItems = userId ? loadStoredWorkspaces(userId, org.id) : [];

        return serverWs.map((w): WorkspaceWithOrg => {
          const local = localItems.find((c) => c.id === w.id);
          const ids = w.visibility === 'restricted' ? (w.memberIds ?? []) : orgRoster.map((m) => m.user.id);
          const members: WorkspaceMember[] = ids
            .map((id) => byId.get(id))
            .filter((u): u is User => !!u)
            .map((u) => ({
              id: u.id,
              displayName: u.displayName || u.email.split('@')[0],
              email: u.email,
              role: u.id === w.createdBy ? 'owner' : 'member',
              avatarUrl: u.avatarUrl,
            }));

          const matchingBoards = allBoards.filter((b) => b.workspaceId === w.id);

          return {
            id: w.id,
            orgId: org.id,
            orgName: org.name,
            name: w.name,
            description: w.description || local?.description || '',
            visibility: (w.visibility ?? 'org') as import('../../models').WorkspaceVisibility,
            memberIds: w.memberIds ?? [],
            membersCount: members.length || ids.length,
            members,
            boards: matchingBoards.map((b) => ({
              id: b.id,
              title: b.name,
              tag: (w.name || '').toUpperCase(),
              privacy: (b.visibility === 'public' ? 'Public' : b.visibility === 'private' ? 'Private' : 'Workspace') as Privacy,
              badge: 'KANBAN',
              starred: false,
              bgClass: (b.backgroundImageUrl ? 'bg-base-200' : b.background || 'bg-board-blue') as any,
            })),
          };
        });
      } catch (err) {
        console.warn(`Failed to fetch workspaces for org ${org.id}`, err);
        const localItems = userId ? loadStoredWorkspaces(userId, org.id) : [];
        return localItems.map((w) => ({
          ...w,
          orgId: org.id,
          orgName: org.name,
        }));
      }
    });

    const results = await Promise.all(orgWorkspacePromises);
    const flatList = results.flat();

    this.workspaces.set(flatList);
    if (flatList.length > 0) {
      if (!this.selectedWorkspaceId() || !flatList.some((w) => w.id === this.selectedWorkspaceId())) {
        this.selectedWorkspaceId.set(flatList[0].id);
      }
    } else {
      this.selectedWorkspaceId.set(null);
    }
  }

  onOrgFilterChange(orgId: string | null): void {
    this.selectedOrgFilter.set(orgId);
  }

  onSelectWorkspace(id: string): void {
    this.selectedWorkspaceId.set(id);
  }

  private persistWorkspaceItem(wsId: string, updatedWs: WorkspaceItem, orgId?: string): void {
    const targetOrgId = orgId || this.workspaces().find((w) => w.id === wsId)?.orgId || this.orgService.activeOrgId();
    const userId = this.auth.currentUser()?.id;
    const orgWorkspaces = loadStoredWorkspaces(userId, targetOrgId);
    const saved = orgWorkspaces.map((w) => (w.id === wsId ? updatedWs : w));
    persistWorkspaces(saved, userId, targetOrgId);
  }

  onAddWorkspaceMember(event: { workspaceId: string; orgId?: string; user: User; role: WorkspaceRole }): void {
    const newMember: WorkspaceMember = {
      id: event.user.id,
      displayName: event.user.displayName || event.user.email.split('@')[0],
      email: event.user.email,
      role: event.role,
      avatarUrl: event.user.avatarUrl,
    };

    let targetUpdatedWs: WorkspaceItem | null = null;
    const updated = this.workspaces().map((w) => {
      if (w.id === event.workspaceId) {
        const members = [...w.members, newMember];
        targetUpdatedWs = { ...w, members, membersCount: members.length };
        return { ...w, members, membersCount: members.length };
      }
      return w;
    });

    this.workspaces.set(updated);
    if (targetUpdatedWs) {
      this.persistWorkspaceItem(event.workspaceId, targetUpdatedWs, event.orgId);
    }
    this.flash(`Added ${newMember.displayName} to the Workspace.`);
  }

  onChangeWorkspaceRole(event: { workspaceId: string; orgId?: string; memberId: string; newRole: WorkspaceRole }): void {
    let targetUpdatedWs: WorkspaceItem | null = null;
    const updated = this.workspaces().map((w) => {
      if (w.id === event.workspaceId) {
        const members = w.members.map((m) => (m.id === event.memberId ? { ...m, role: event.newRole } : m));
        targetUpdatedWs = { ...w, members };
        return { ...w, members };
      }
      return w;
    });

    this.workspaces.set(updated);
    if (targetUpdatedWs) {
      this.persistWorkspaceItem(event.workspaceId, targetUpdatedWs, event.orgId);
    }
    this.flash('Member role updated.');
  }

  onRemoveWorkspaceMember(event: { workspaceId: string; orgId?: string; member: WorkspaceMember }): void {
    const currentWs = this.workspaces().find((w) => w.id === event.workspaceId);
    if (event.member.role === 'owner' && (currentWs?.members.filter((m) => m.role === 'owner').length ?? 0) <= 1) {
      this.flash('The Workspace must have at least 1 Owner.', 'error');
      return;
    }

    let targetUpdatedWs: WorkspaceItem | null = null;
    const updated = this.workspaces().map((w) => {
      if (w.id === event.workspaceId) {
        const members = w.members.filter((m) => m.id !== event.member.id);
        targetUpdatedWs = { ...w, members, membersCount: members.length };
        return { ...w, members, membersCount: members.length };
      }
      return w;
    });

    this.workspaces.set(updated);
    if (targetUpdatedWs) {
      this.persistWorkspaceItem(event.workspaceId, targetUpdatedWs, event.orgId);
    }
    this.flash(`Removed ${event.member.displayName} from the Workspace.`);
  }

  // ---------------------------------------------------------------------
  // TAB 3: Manage Organization handlers
  // ---------------------------------------------------------------------
  /**
   * Thành viên tổ chức KÈM VAI TRÒ THẬT.
   *
   * ⚠️ Trước đây chỗ này `.map((m) => m.user)` — vứt luôn trường `role`. Bảng
   *    thành viên bên dưới vì thế phải đoán: `id === ownerId` thì hiện "Trưởng
   *    nhóm", còn lại hiện cứng "Thành viên". Ai là `admin` cũng bị hiển thị
   *    thành "Thành viên".
   */
  readonly orgMembers = computed<OrgMemberView[]>(() =>
    this.orgService.membersOf(this.orgService.activeOrgId()),
  );

  onSwitchOrg(orgId: string): void {
    this.orgService.switchOrg(orgId);
  }

  async onChangeOrgRole(data: { userId: string; role: Role }): Promise<void> {
    const org = this.orgService.activeOrg();
    if (!org) return;
    const member = this.orgMembers().find((m) => m.user.id === data.userId);
    const name = member?.user.displayName ?? member?.user.email ?? 'member';
    const error = await this.orgService.changeRole(org.id, data.userId, data.role);
    if (error) {
      this.flash(error, 'error');
      return;
    }
    this.flash(`Changed ${name} to ${data.role === 'admin' ? 'Admin' : 'Member'}.`);
  }

  // ---- Xoá tổ chức (gõ lại đúng tên mới xoá được) ----

  readonly showDeleteOrgModal = signal(false);
  readonly orgPendingDelete = signal<Organization | null>(null);
  readonly deletingOrg = signal(false);
  readonly deleteOrgError = signal<string | null>(null);

  // ---- Modal tạo / sửa Workspace ----
  readonly showWorkspaceModal = signal(false);
  readonly workspaceModalMode = signal<'create' | 'edit'>('create');
  readonly selectedWorkspaceForEdit = signal<WorkspaceItem | null>(null);

  openCreateWorkspace(): void {
    const filter = this.selectedOrgFilter();
    if (filter) {
      const role = this.orgService.myRoleByOrg()[filter];
      if (role !== 'owner' && role !== 'admin') {
        this.flash('Only the Organization Owner or Admins can create workspaces.', 'error');
        return;
      }
    }
    this.workspaceModalMode.set('create');
    this.selectedWorkspaceForEdit.set(null);
    this.showWorkspaceModal.set(true);
  }

  readonly isSavingWorkspace = signal<boolean>(false);

  async handleWorkspaceSave(data: {
    orgId?: string;
    name: string;
    description: string;
    visibility: import('../../models').WorkspaceVisibility;
    memberIds: string[];
    members: WorkspaceMember[];
  }): Promise<void> {
    if (this.isSavingWorkspace()) return;
    this.isSavingWorkspace.set(true);

    try {
      const { name, description, visibility, memberIds, members } = data;
      const orgId = data.orgId || this.selectedOrgFilter() || this.orgService.activeOrgId() || this.orgService.organizations()[0]?.id;
      if (!orgId) {
        this.flash('No active Organization found. Please create or select an organization first.', 'error');
        return;
      }

      const role = this.orgService.myRoleByOrg()[orgId];
      if (role !== 'owner' && role !== 'admin') {
        this.flash('Only the Organization Owner or Admins can create workspaces.', 'error');
        return;
      }

      const { workspace, error } = await this.workspaceService.createWorkspace(
        orgId,
        name,
        description,
        visibility,
        memberIds,
      );
      if (!workspace) {
        this.flash(error ?? 'Failed to create the workspace.', 'error');
        return;
      }

      const foundOrg = this.orgService.organizations().find((o) => o.id === orgId);
      const newWs: WorkspaceWithOrg = {
        id: workspace.id,
        orgId,
        orgName: foundOrg?.name ?? 'Organization',
        name: workspace.name,
        visibility: workspace.visibility,
        memberIds: workspace.memberIds,
        membersCount: members.length,
        members,
        description: description || 'A brand-new Workspace just got created.',
        boards: [],
      };

      const userId = this.auth.currentUser()?.id;
      const orgWorkspaces = loadStoredWorkspaces(userId, orgId);
      persistWorkspaces([...orgWorkspaces, newWs], userId, orgId);

      this.showWorkspaceModal.set(false);
      this.flash(`Created Workspace "${newWs.name}"!`);
      await this.loadWorkspacesForOrganizations();
      this.selectedWorkspaceId.set(newWs.id);
    } finally {
      this.isSavingWorkspace.set(false);
    }
  }

  // ---- Modal xác nhận xoá Workspace (GitHub style) ----
  readonly showDeleteWorkspaceModal = signal(false);
  readonly workspacePendingDelete = signal<WorkspaceItem | null>(null);
  readonly deletingWorkspace = signal(false);
  readonly deleteWorkspaceError = signal<string | null>(null);

  /** Bước 1 — chỉ mở hộp thoại xác nhận xoá Workspace. */
  requestDeleteWorkspace(wsId: string): void {
    const ws = this.workspaces().find((w) => w.id === wsId);
    if (!ws) return;
    const role = this.orgService.myRoleByOrg()[ws.orgId];
    if (role !== 'owner' && role !== 'admin') {
      this.flash('Only the Organization Owner or Admins can delete workspaces.', 'error');
      return;
    }
    this.workspacePendingDelete.set(ws);
    this.deleteWorkspaceError.set(null);
    this.showDeleteWorkspaceModal.set(true);
  }

  /** Huỷ xoá workspace. */
  cancelDeleteWorkspace(): void {
    if (this.deletingWorkspace()) return;
    this.showDeleteWorkspaceModal.set(false);
    this.workspacePendingDelete.set(null);
    this.deleteWorkspaceError.set(null);
  }

  /** Bước 2 — xác nhận xoá Workspace đã gõ đúng tên. */
  async confirmDeleteWorkspace(): Promise<void> {
    if (this.deletingWorkspace()) return;

    const ws = this.workspacePendingDelete();
    if (!ws) return;

    this.deletingWorkspace.set(true);
    this.deleteWorkspaceError.set(null);
    try {
      const error = await this.workspaceService.deleteWorkspace(ws.id);
      if (error) {
        this.deleteWorkspaceError.set(error);
        return;
      }

      // Xoá khỏi localStorage và danh sách state cục bộ
      const targetOrgId = (ws as WorkspaceWithOrg).orgId || this.orgService.activeOrgId();
      const userId = this.auth.currentUser()?.id;
      const orgWorkspaces = loadStoredWorkspaces(userId, targetOrgId);
      const saved = orgWorkspaces.filter((w) => w.id !== ws.id);
      persistWorkspaces(saved, userId, targetOrgId);

      this.showDeleteWorkspaceModal.set(false);
      this.workspacePendingDelete.set(null);
      this.flash(`Deleted workspace "${ws.name}".`, 'info');
      await this.loadWorkspacesForOrganizations();
    } finally {
      this.deletingWorkspace.set(false);
    }
  }

  /** Bước 1 — chỉ mở hộp thoại xác nhận. Chưa gọi API, chưa đụng gì tới dữ liệu. */
  requestDeleteOrg(orgId: string): void {
    if (this.orgService.myRoleByOrg()[orgId] !== 'owner') {
      this.flash('Only the Organization Owner can delete the organization.', 'error');
      return;
    }
    const org = this.orgService.organizations().find((o) => o.id === orgId);
    if (!org) return;
    this.orgPendingDelete.set(org);
    this.deleteOrgError.set(null);
    this.showDeleteOrgModal.set(true);
  }

  /** Huỷ (Cancel / X / nền) — tổ chức giữ nguyên, không đổi gì. */
  cancelDeleteOrg(): void {
    // Đang gọi API dở thì không cho rút lui: đóng modal lúc này chỉ làm người
    // dùng tưởng đã huỷ được, trong khi request vẫn đang chạy tới server.
    if (this.deletingOrg()) return;
    this.showDeleteOrgModal.set(false);
    this.orgPendingDelete.set(null);
    this.deleteOrgError.set(null);
  }

  /** Bước 2 — người dùng đã gõ đúng tên tổ chức và bấm Delete. */
  async confirmDeleteOrg(): Promise<void> {
    // Chốt chặn cuối cho double-click: cú click thứ hai vào đây quay đầu ngay,
    // không bắn thêm một request xoá thứ hai.
    if (this.deletingOrg()) return;

    const org = this.orgPendingDelete();
    if (!org) return;

    this.deletingOrg.set(true);
    this.deleteOrgError.set(null);
    try {
      const error = await this.orgService.deleteOrg(org.id);
      if (error) {
        // Hỏng thì GIỮ modal mở kèm lỗi — tổ chức vẫn còn đó, người dùng thử lại được.
        this.deleteOrgError.set(error);
        return;
      }

      this.showDeleteOrgModal.set(false);
      this.orgPendingDelete.set(null);
      this.flash(`Deleted organization "${org.name}".`, 'info');

      // Không còn tổ chức nào thì trang Cài đặt cũng không có gì để quản lý nữa.
      if (!this.orgService.activeOrgSlug()) {
        void this.router.navigate(['/onboarding']);
      }
    } finally {
      this.deletingOrg.set(false);
    }
  }

  /** Slug đã bị chiếm hay chưa thì CHỈ backend biết (nó giữ tổ chức của mọi người,
   *  trình duyệt này chỉ thấy tổ chức của user đang đăng nhập). Modal vì thế không
   *  cảnh báo lúc gõ nữa — bấm Tạo, backend trả 409 kèm câu tiếng Việt sẵn. */

  readonly isCreatingOrg = signal(false);

  async onCreateOrg(event: { name: string; slug: string }): Promise<void> {
    if (this.isCreatingOrg()) return;
    this.isCreatingOrg.set(true);
    try {
      const { org, error } = await this.orgService.createOrg(event.name, event.slug);
      if (!org) {
        this.flash(error ?? 'Failed to create the organization, please try again!', 'error');
        return;
      }
      this.flash(`Created organization "${org.name}" successfully!`);
    } finally {
      this.isCreatingOrg.set(false);
    }
  }

  async onInviteOrgMember(data: { user: User; role: OrgInviteRole }): Promise<void> {
    const org = this.orgService.activeOrg();
    if (!org) return;
    const error = await this.orgService.inviteMember(org.id, data.user.id, data.role);
    if (error) {
      this.flash(error, 'error');
      return;
    }
    const quyen = data.role === 'admin' ? 'admin' : 'member';
    this.flash(
      `Sent invite to join "${org.name}" to ${data.user.displayName || data.user.email} (as ${quyen}).`,
    );
  }

  async onRemoveOrgMember(memberId: string): Promise<void> {
    const org = this.orgService.activeOrg();
    if (!org) return;
    const error = await this.orgService.removeMember(org.id, memberId);
    if (error) {
      this.flash(error, 'error');
      return;
    }
    this.flash('Removed member from the Organization.');
  }
}

