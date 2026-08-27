import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideBuilding2, LucideCrown, LucideGlobe, LucidePlus, LucideTriangleAlert, LucideX } from '@lucide/angular';
import { User } from '../../../models';
import { Organization, WorkspaceMember, WorkspaceRole, WorkspaceWithOrg } from '../../../mocks';
import { UserAvatar } from '../../shared/user-avatar/user-avatar';

@Component({
  selector: 'app-manage-workspace-tab',
  imports: [FormsModule, LucideBuilding2, LucideCrown, LucidePlus, LucideTriangleAlert, LucideX, UserAvatar],
  templateUrl: './manage-workspace-tab.html',
  host: { class: 'block' },
})
export class ManageWorkspaceTab {
  readonly organizations = input<Organization[]>([]);
  readonly selectedOrgFilter = input<string | null>(null); // null = Tất cả Organization
  readonly workspaces = input<WorkspaceWithOrg[]>([]);
  readonly selectedWorkspaceId = input<string | null>(null);
  readonly searchableUsers = input<User[]>([]);
  readonly myRoleByOrg = input<Record<string, 'owner' | 'admin' | 'member'>>({});

  readonly changeOrgFilter = output<string | null>();
  readonly selectWorkspace = output<string>();
  readonly addMember = output<{ workspaceId: string; orgId?: string; user: User; role: WorkspaceRole }>();
  readonly changeRole = output<{ workspaceId: string; orgId?: string; memberId: string; newRole: WorkspaceRole }>();
  readonly removeMember = output<{ workspaceId: string; orgId?: string; member: WorkspaceMember }>();
  readonly requestDeleteWorkspace = output<string>();
  readonly requestCreateWorkspace = output<void>();
  readonly flashMessage = output<{ message: string; type?: 'success' | 'error' | 'info' }>();

  readonly selectedWorkspace = computed(() => {
    const id = this.selectedWorkspaceId();
    return this.workspaces().find((w) => w.id === id) || this.workspaces()[0] || null;
  });

  readonly canManageCurrentWorkspace = computed(() => {
    const ws = this.selectedWorkspace();
    if (!ws) return false;
    const role = this.myRoleByOrg()[ws.orgId];
    return role === 'owner' || role === 'admin';
  });

  readonly currentOrgRole = computed<'owner' | 'admin' | 'member' | null>(() => {
    const ws = this.selectedWorkspace();
    if (!ws) return null;
    return this.myRoleByOrg()[ws.orgId] ?? null;
  });

  /**
   * Quyền gỡ thành viên workspace:
   * - Owner: gỡ được admin & member.
   * - Admin: CHỈ gỡ được member (không gỡ owner, không gỡ admin khác).
   * - Member: không gỡ được ai.
   */
  canRemoveWorkspaceMember(mem: WorkspaceMember): boolean {
    if (mem.role === 'owner') return false;
    const orgRole = this.currentOrgRole();
    if (orgRole === 'owner') return true;
    if (orgRole === 'admin') return mem.role === 'member';
    return false;
  }

  readonly canCreateWorkspace = computed(() => {
    const filter = this.selectedOrgFilter();
    if (filter) {
      const role = this.myRoleByOrg()[filter];
      return role === 'owner' || role === 'admin';
    }
    const roles = Object.values(this.myRoleByOrg());
    return roles.length === 0 || roles.some((r) => r === 'owner' || r === 'admin');
  });

  // Add Member Modal State
  readonly showAddMemberModal = signal(false);
  readonly memberSearchQuery = signal('');
  readonly memberRoleSelect = signal<WorkspaceRole>('member');
  readonly selectedUserToAdd = signal<User | null>(null);

  readonly searchCandidateUsers = computed(() => {
    const q = this.memberSearchQuery().trim().toLowerCase();
    const allUsers = this.searchableUsers();
    const currentMemberIds = new Set(this.selectedWorkspace()?.members.map((m) => m.id.toLowerCase()) || []);

    return allUsers.filter((u) => {
      if (currentMemberIds.has(u.id.toLowerCase())) return false;
      if (!q) return true;
      return (
        u.id.toLowerCase().includes(q) ||
        (u.displayName && u.displayName.toLowerCase().includes(q)) ||
        u.email.toLowerCase().includes(q)
      );
    });
  });

  openAddMember(): void {
    this.memberSearchQuery.set('');
    this.selectedUserToAdd.set(null);
    this.memberRoleSelect.set('member');
    this.showAddMemberModal.set(true);
  }

  closeAddMember(): void {
    this.showAddMemberModal.set(false);
  }

  chooseUserToAdd(user: User): void {
    this.selectedUserToAdd.set(user);
    this.memberSearchQuery.set(user.displayName || user.email);
  }

  confirmAddMember(): void {
    const ws = this.selectedWorkspace();
    const user = this.selectedUserToAdd();
    if (!ws || !user) {
      this.flashMessage.emit({ message: 'Please select a user to add.', type: 'error' });
      return;
    }

    this.addMember.emit({
      workspaceId: ws.id,
      orgId: ws.orgId,
      user,
      role: this.memberRoleSelect(),
    });
    this.closeAddMember();
  }

  onChangeMemberRole(memberId: string, newRole: WorkspaceRole): void {
    const ws = this.selectedWorkspace();
    if (!ws) return;
    this.changeRole.emit({ workspaceId: ws.id, orgId: ws.orgId, memberId, newRole });
  }

  onRemoveMember(member: WorkspaceMember): void {
    const ws = this.selectedWorkspace();
    if (!ws) return;
    this.removeMember.emit({ workspaceId: ws.id, orgId: ws.orgId, member });
  }
}
