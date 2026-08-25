import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideBuilding2, LucideCrown, LucideGlobe, LucidePlus, LucideX } from '@lucide/angular';
import { User } from '../../../models';
import { Organization, WorkspaceMember, WorkspaceWithOrg, avatarBgFor, initialsOf } from '../../../mocks';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-manage-workspace-tab',
  imports: [FormsModule, LucideBuilding2, LucideCrown, LucidePlus, LucideX],
  templateUrl: './manage-workspace-tab.html',
  host: { class: 'block' },
})
export class ManageWorkspaceTab {
  private readonly auth = inject(AuthService);

  readonly organizations = input<Organization[]>([]);
  readonly selectedOrgFilter = input<string | null>(null); // null = Tất cả Organization
  readonly workspaces = input<WorkspaceWithOrg[]>([]);
  readonly selectedWorkspaceId = input<string | null>(null);
  readonly searchableUsers = input<User[]>([]);

  readonly changeOrgFilter = output<string | null>();
  readonly selectWorkspace = output<string>();
  readonly addMember = output<{ workspaceId: string; orgId?: string; user: User; role: 'owner' | 'member' }>();
  readonly changeRole = output<{ workspaceId: string; orgId?: string; memberId: string; newRole: 'owner' | 'member' }>();
  readonly removeMember = output<{ workspaceId: string; orgId?: string; member: WorkspaceMember }>();
  readonly flashMessage = output<{ message: string; type?: 'success' | 'error' | 'info' }>();

  readonly initialsOf = initialsOf;
  readonly avatarBgFor = avatarBgFor;

  /**
   * `WorkspaceMember` bị đóng băng lúc thêm vào workspace (lưu localStorage, xem
   * `mocks/workspace.mock.ts`) nên KHÔNG tự cập nhật khi chính người này đổi
   * avatar/tên ở Cài đặt sau đó. Ghi đè bằng `AuthService.currentUser()` — cùng
   * cách làm với `OrganizationStore.membersOf()` — khi dòng đang vẽ là chính mình.
   */
  memberDisplayName(mem: WorkspaceMember): string {
    const me = this.auth.currentUser();
    return me && me.id === mem.id ? me.displayName || me.email : mem.displayName || mem.email;
  }

  memberAvatarUrl(mem: WorkspaceMember): string | undefined {
    const me = this.auth.currentUser();
    return me && me.id === mem.id ? me.avatarUrl : mem.avatarUrl;
  }

  readonly selectedWorkspace = computed(() => {
    const id = this.selectedWorkspaceId();
    return this.workspaces().find((w) => w.id === id) || this.workspaces()[0] || null;
  });

  // Add Member Modal State
  readonly showAddMemberModal = signal(false);
  readonly memberSearchQuery = signal('');
  readonly memberRoleSelect = signal<'member' | 'owner'>('member');
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

  onChangeMemberRole(memberId: string, newRole: 'owner' | 'member'): void {
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
