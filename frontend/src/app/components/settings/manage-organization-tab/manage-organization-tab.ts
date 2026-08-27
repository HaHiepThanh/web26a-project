import { Component, computed, inject, input, output, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideBuilding2,
  LucideCrown,
  LucidePlus,
  LucideTriangleAlert,
  LucideUserPlus,
  LucideX,
} from '@lucide/angular';
import { Organization } from '../../../mocks';
import { OrgInviteRole, OrgMemberView, Role, User } from '../../../models';
import { UserSearchService } from '../../../services/user-search.service';
import { OrgCreateModal } from '../../workspace/org-create-modal/org-create-modal';
import { UserAvatar } from '../../shared/user-avatar/user-avatar';

@Component({
  selector: 'app-manage-organization-tab',
  imports: [NgClass, FormsModule, LucideBuilding2, LucideCrown, LucidePlus, LucideTriangleAlert, LucideUserPlus, LucideX, OrgCreateModal, UserAvatar],
  templateUrl: './manage-organization-tab.html',
  host: { class: 'block' },
})
export class ManageOrganizationTab {
  readonly organizations = input<Organization[]>([]);
  readonly activeOrgId = input<string | null>(null);
  readonly activeOrg = input<Organization | null>(null);
  /** Kèm `role` thật từ backend — không suy ra từ ownerId nữa. */
  readonly orgMembers = input<OrgMemberView[]>([]);
  private readonly userSearch = inject(UserSearchService);

  /** Quyền người được mời sẽ nhận khi họ bấm Đồng ý. */
  readonly inviteRole = signal<OrgInviteRole>('member');
  readonly currentUserId = input<string | null>(null);

  readonly switchOrg = output<string>();
  /** Kiểm slug đã bị chiếm chưa — truyền xuống modal, nếu thiếu thì modal không
   *  cảnh báo được và user sẽ bấm Tạo rồi thất bại im lặng. */

  readonly createOrg = output<{ name: string; slug: string }>();
  readonly inviteMember = output<{ user: User; role: OrgInviteRole }>();
  readonly removeMember = output<string>();
  readonly changeRole = output<{ userId: string; role: Role }>();
  /**
   * YÊU CẦU xoá tổ chức, không phải lệnh xoá: trang Cài đặt mở hộp thoại xác
   * nhận (gõ lại đúng tên) rồi mới thật sự gọi API.
   */
  readonly requestDeleteOrg = output<string>();
  readonly flashMessage = output<{ message: string; type?: 'success' | 'error' | 'info' }>();


  // Create Org Modal state
  readonly showCreateOrgModal = signal(false);

  // Invite-to-org modal state
  readonly showInviteOrgModal = signal(false);
  readonly orgInviteQuery = signal('');
  readonly selectedOrgInviteUser = signal<User | null>(null);

  readonly searching = this.userSearch.searching;

  /**
   * Ứng viên để mời — GỌI BACKEND (`GET /users/search`).
   *
   * ⚠️ Bản trước lọc trong `searchableUsers` (đọc localStorage) nên chỉ thấy
   *    những người đã đăng nhập trên chính máy này — dán id của đồng nghiệp vào
   *    thì không bao giờ ra.
   */
  readonly orgInviteCandidates = computed<User[]>(() => {
    const me = this.currentUserId();
    const currentMemberIds = new Set(this.activeOrg()?.memberIds ?? []);
    return this.userSearch
      .results()
      .filter((u) => u.id !== me && !currentMemberIds.has(u.id))
      .map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName ?? undefined,
        avatarUrl: u.avatarUrl ?? undefined,
      }));
  });

  onInviteQueryChange(value: string): void {
    this.orgInviteQuery.set(value);
    this.selectedOrgInviteUser.set(null);
    this.userSearch.search(value);
  }

  openInviteOrgMember(): void {
    this.orgInviteQuery.set('');
    this.selectedOrgInviteUser.set(null);
    this.inviteRole.set('member');
    this.userSearch.clear();
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
      this.flashMessage.emit({ message: 'Please select a user to invite.', type: 'error' });
      return;
    }

    this.inviteMember.emit({ user, role: this.inviteRole() });
    this.closeInviteOrgMember();
  }

  onRemoveOrgMember(memberId: string): void {
    this.removeMember.emit(memberId);
  }

  readonly myRole = computed<Role | null>(() => {
    const me = this.currentUserId();
    return this.orgMembers().find((m) => m.user.id === me)?.role ?? null;
  });

  /** Chỉ chủ tổ chức đổi được quyền — nút này ẩn với người khác. */
  readonly isOwner = computed(() => {
    const me = this.currentUserId();
    return !!me && this.orgMembers().some((m) => m.user.id === me && m.role === 'owner');
  });

  /** Owner và Admin có quyền quản lý thành viên (mời / xem cột Action) */
  readonly canManageMembers = computed(() => {
    const role = this.myRole();
    return role === 'owner' || role === 'admin';
  });

  /**
   * Quyền gỡ thành viên:
   * - Owner: xoá được admin & member (trừ chính mình).
   * - Admin: CHỈ xoá được member. Không xoá admin khác, không xoá owner, không tự xoá mình.
   * - Member: không xoá được ai.
   */
  canRemoveOrgMember(mem: OrgMemberView): boolean {
    const me = this.currentUserId();
    if (!me || mem.user.id === me || mem.role === 'owner') return false;
    const role = this.myRole();
    if (role === 'owner') return true;
    if (role === 'admin') return mem.role === 'member';
    return false;
  }

  onChangeRole(userId: string, value: string): void {
    if (value !== 'admin' && value !== 'member') return;
    this.changeRole.emit({ userId, role: value });
  }

  roleLabel(role: Role): string {
    if (role === 'owner') return 'Owner';
    return role === 'admin' ? 'Admin' : 'Member';
  }
}
