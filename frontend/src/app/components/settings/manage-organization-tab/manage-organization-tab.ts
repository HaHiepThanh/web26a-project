import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideBuilding2, LucideCrown, LucidePlus, LucideUserPlus, LucideX } from '@lucide/angular';
import { Organization } from '../../../mocks';
import { User } from '../../../models';
import { avatarBgFor, initialsOf } from '../../../mocks';
import { OrgCreateModal } from '../../workspace/org-create-modal/org-create-modal';

@Component({
  selector: 'app-manage-organization-tab',
  imports: [FormsModule, LucideBuilding2, LucideCrown, LucidePlus, LucideUserPlus, LucideX, OrgCreateModal],
  templateUrl: './manage-organization-tab.html',
  host: { class: 'block' },
})
export class ManageOrganizationTab {
  readonly organizations = input<Organization[]>([]);
  readonly activeOrgId = input<string | null>(null);
  readonly activeOrg = input<Organization | null>(null);
  readonly orgMembers = input<User[]>([]);
  readonly searchableUsers = input<User[]>([]);
  readonly currentUserId = input<string | null>(null);

  readonly switchOrg = output<string>();
  /** Kiểm slug đã bị chiếm chưa — truyền xuống modal, nếu thiếu thì modal không
   *  cảnh báo được và user sẽ bấm Tạo rồi thất bại im lặng. */

  readonly createOrg = output<{ name: string; slug: string }>();
  readonly inviteMember = output<User>();
  readonly removeMember = output<string>();
  readonly flashMessage = output<{ message: string; type?: 'success' | 'error' | 'info' }>();

  readonly initialsOf = initialsOf;
  readonly avatarBgFor = avatarBgFor;

  // Create Org Modal state
  readonly showCreateOrgModal = signal(false);

  // Invite-to-org modal state
  readonly showInviteOrgModal = signal(false);
  readonly orgInviteQuery = signal('');
  readonly selectedOrgInviteUser = signal<User | null>(null);

  readonly orgInviteCandidates = computed(() => {
    const q = this.orgInviteQuery().trim().toLowerCase();
    const allUsers = this.searchableUsers();
    const me = this.currentUserId();
    const currentMemberIds = new Set(this.activeOrg()?.memberIds ?? []);

    return allUsers.filter((u) => {
      if (u.id === me || currentMemberIds.has(u.id)) return false;
      if (!q) return true;
      return (
        u.id.toLowerCase().includes(q) ||
        (u.displayName && u.displayName.toLowerCase().includes(q)) ||
        u.email.toLowerCase().includes(q)
      );
    });
  });

  openInviteOrgMember(): void {
    this.orgInviteQuery.set('');
    this.selectedOrgInviteUser.set(null);
    this.showInviteOrgModal.set(true);
  }

  closeInviteOrgMember(): void {
    this.showInviteOrgModal.set(false);
  }

  chooseOrgInviteUser(user: User): void {
    this.selectedOrgInviteUser.set(user);
    this.orgInviteQuery.set(user.displayName || user.email);
  }

  confirmInviteOrgMember(): void {
    const org = this.activeOrg();
    const user = this.selectedOrgInviteUser();
    if (!org || !user) {
      this.flashMessage.emit({ message: 'Vui lòng chọn một người dùng để mời.', type: 'error' });
      return;
    }

    this.inviteMember.emit(user);
    this.closeInviteOrgMember();
  }

  onRemoveOrgMember(memberId: string): void {
    this.removeMember.emit(memberId);
  }
}
