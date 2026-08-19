import { Component, computed, effect, inject, signal } from '@angular/core';
import {
  LucideBuilding2,
  LucideUser,
  LucideUsers,
} from '@lucide/angular';
import { AuthService } from '../../services/auth.service';
import { OrganizationService } from '../../services/organization.service';
import { User } from '../../models';
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

@Component({
  selector: 'app-settings',
  imports: [
    LucideBuilding2,
    LucideUser,
    LucideUsers,
    ProfileTab,
    ManageWorkspaceTab,
    ManageOrganizationTab,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
  host: { class: 'flex flex-1 min-h-0 overflow-hidden' },
})
export class Settings {
  readonly auth = inject(AuthService);
  readonly orgService = inject(OrganizationService);

  readonly currentUser = this.auth.currentUser;
  readonly searchableUsers = computed(() => this.auth.getSearchableUsers());

  // ---------------------------------------------------------------------
  // Navigation & Tabs
  // ---------------------------------------------------------------------
  readonly navItems = NAV_ITEMS;
  readonly activeTab = signal<SettingsTab>('profile');

  onTabChange(tab: SettingsTab): void {
    this.activeTab.set(tab);
  }

  // ---------------------------------------------------------------------
  // Toast notifications
  // ---------------------------------------------------------------------
  readonly toastMessage = signal<string | null>(null);
  readonly toastType = signal<'success' | 'error' | 'info'>('success');
  private toastTimer?: ReturnType<typeof setTimeout>;

  flash(message: string, type: 'success' | 'error' | 'info' = 'success'): void {
    this.toastMessage.set(message);
    this.toastType.set(type);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastMessage.set(null), 3000);
  }

  // ---------------------------------------------------------------------
  // TAB 1: Profile handlers
  // ---------------------------------------------------------------------
  onSaveProfile(user: User): void {
    this.auth.setUser(user);
    this.flash('Đã cập nhật thông tin cá nhân thành công!');
  }

  onChangePassword(event: { currentPassword: string; newPassword: string }): void {
    const cur = this.currentUser();
    if (cur?.password && cur.password !== event.currentPassword) {
      this.flash('Mật khẩu hiện tại không chính xác. Vui lòng thử lại!', 'error');
      return;
    }

    if (cur) {
      this.auth.setUser({ ...cur, password: event.newPassword });
    }
    this.flash('Đã đổi mật khẩu thành công!');
  }

  // ---------------------------------------------------------------------
  // TAB 2: Manage Workspace handlers
  // ---------------------------------------------------------------------
  readonly selectedOrgFilter = signal<string | null>(null); // null = Tất cả Organization
  readonly workspaces = signal<WorkspaceWithOrg[]>([]);
  readonly selectedWorkspaceId = signal<string | null>(null);

  constructor() {
    effect(() => {
      const userId = this.auth.currentUser()?.id;
      const orgFilter = this.selectedOrgFilter();
      const orgs = this.orgService.organizations();

      let list: WorkspaceWithOrg[];
      if (orgFilter === null) {
        list = loadAllWorkspacesForUser(userId, orgs);
      } else {
        const foundOrg = orgs.find((o) => o.id === orgFilter);
        const orgWorkspaces = loadStoredWorkspaces(userId, orgFilter);
        list = orgWorkspaces.map((w) => ({
          ...w,
          orgId: orgFilter,
          orgName: foundOrg?.name ?? 'Tổ chức',
        }));
      }

      this.workspaces.set(list);
      if (list.length > 0) {
        if (!this.selectedWorkspaceId() || !list.some((w) => w.id === this.selectedWorkspaceId())) {
          this.selectedWorkspaceId.set(list[0].id);
        }
      } else {
        this.selectedWorkspaceId.set(null);
      }
    });
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

  onAddWorkspaceMember(event: { workspaceId: string; orgId?: string; user: User; role: 'owner' | 'member' }): void {
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
    this.flash(`Đã thêm ${newMember.displayName} vào Workspace.`);
  }

  onChangeWorkspaceRole(event: { workspaceId: string; orgId?: string; memberId: string; newRole: 'owner' | 'member' }): void {
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
    this.flash('Đã cập nhật vai trò thành viên.');
  }

  onRemoveWorkspaceMember(event: { workspaceId: string; orgId?: string; member: WorkspaceMember }): void {
    const currentWs = this.workspaces().find((w) => w.id === event.workspaceId);
    if (event.member.role === 'owner' && (currentWs?.members.filter((m) => m.role === 'owner').length ?? 0) <= 1) {
      this.flash('Workspace phải có ít nhất 1 Trưởng nhóm (Owner).', 'error');
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
    this.flash(`Đã xóa ${event.member.displayName} khỏi Workspace.`);
  }

  // ---------------------------------------------------------------------
  // TAB 3: Manage Organization handlers
  // ---------------------------------------------------------------------
  readonly orgMembers = computed<User[]>(() => {
    const org = this.orgService.activeOrg();
    if (!org) return [];
    const allUsers = this.auth.getSearchableUsers();
    return org.memberIds.map(
      (id) => allUsers.find((u) => u.id === id) ?? ({ id, displayName: 'Người dùng ẩn danh', email: '—' } as User),
    );
  });

  onSwitchOrg(orgId: string): void {
    this.orgService.switchOrg(orgId);
  }

  onCreateOrg(event: { name: string; icon: string }): void {
    const org = this.orgService.createOrg(event.name, event.icon);
    if (org) {
      this.flash(`Đã tạo tổ chức "${org.name}" thành công!`);
    }
  }

  onInviteOrgMember(user: User): void {
    const org = this.orgService.activeOrg();
    if (!org) return;
    const error = this.orgService.inviteMemberByUuid(org.id, user.id);
    if (error) {
      this.flash(error, 'error');
      return;
    }
    this.flash(`Đã gửi lời mời tham gia "${org.name}" cho ${user.displayName || user.email}.`);
  }

  onRemoveOrgMember(memberId: string): void {
    const org = this.orgService.activeOrg();
    if (!org) return;
    const error = this.orgService.removeMember(org.id, memberId);
    if (error) {
      this.flash(error, 'error');
      return;
    }
    this.flash('Đã xóa thành viên khỏi Organization.');
  }
}
