import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  BoardMember,
  BoardRole,
  CURRENT_USER_ID,
  ProjectDetail,
  mockProjectDetail,
  roleLabel,
} from '../manage-workspace.models';

import { Toast, ToastType } from '../../../../models';
type MembersTab = 'members' | 'invitations' | 'requests';

/**
 * Screen 2 — quản lý thành viên của 1 project (board) cụ thể.
 * "Xem danh sách + xem card đang giữ" là quyền chung cho mọi thành viên.
 * Mọi hành động chỉnh sửa (mời/xoá/đổi role/duyệt request/thu hồi lời mời)
 * chỉ hiện với role 'admin' — xem bảng RBAC trong tài liệu thiết kế.
 *
 * Dữ liệu đang là mock (xem manage-workspace.models.ts). Khi trang Board
 * (list/card) có backend thật, thay mockProjectDetail() bằng gọi API thật;
 * phần UI + RBAC dưới đây không cần đổi.
 */
@Component({
  selector: 'app-project-members',
  imports: [FormsModule, RouterLink],
  templateUrl: './project-members.html',
  styleUrl: './project-members.css',
})
export class ProjectMembers {
  private readonly route = inject(ActivatedRoute);
  readonly roleLabel = roleLabel;
  readonly roleOptions: BoardRole[] = ['admin', 'member', 'observer'];
  readonly roleBadge: Record<string, string> = {
    admin: 'badge-primary badge-soft',
    member: 'badge-success badge-soft',
    observer: 'badge-ghost',
  };
  readonly CURRENT_USER_ID = CURRENT_USER_ID;

  private readonly boardId = this.route.snapshot.paramMap.get('boardId') ?? '';
  readonly project = signal<ProjectDetail | null>(mockProjectDetail(this.boardId));

  readonly myRole = computed(() => this.project()?.members.find((m) => m.userId === CURRENT_USER_ID)?.role ?? null);
  readonly isAdmin = computed(() => this.myRole() === 'admin');
  readonly isMember = computed(() => this.myRole() !== null);

  readonly activeTab = signal<MembersTab>('members');

  /** Non-admin không có tab admin-only — nếu URL/state trỏ vào đó thì fallback về 'members'. */
  setTab(tab: MembersTab): void {
    if ((tab === 'invitations' || tab === 'requests') && !this.isAdmin()) {
      this.activeTab.set('members');
      return;
    }
    this.activeTab.set(tab);
  }

  // ---- Member list + search + assigned-cards expand ----
  readonly searchQuery = signal('');
  readonly expandedMemberId = signal<string | null>(null);

  readonly filteredMembers = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const members = this.project()?.members ?? [];
    if (!q) return members;
    return members.filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
  });

  toggleExpandedCards(userId: string): void {
    this.expandedMemberId.update((cur) => (cur === userId ? null : userId));
  }

  private adminCount(): number {
    return this.project()?.members.filter((m) => m.role === 'admin').length ?? 0;
  }

  isLastAdmin(member: BoardMember): boolean {
    return member.role === 'admin' && this.adminCount() <= 1;
  }

  onChangeRole(member: BoardMember, role: BoardRole): void {
    if (member.userId === CURRENT_USER_ID && this.isLastAdmin(member) && role !== 'admin') {
      this.flash('Không thể tự hạ quyền — bạn là Admin duy nhất của dự án này.', 'error');
      return;
    }
    this.project.update((p) => {
      if (!p) return p;
      return { ...p, members: p.members.map((m) => (m.userId === member.userId ? { ...m, role } : m)) };
    });
    this.flash(`Đã đổi vai trò của ${member.name} thành ${roleLabel(role)}.`, 'success');
  }

  // ---- Remove member ----
  readonly memberToRemove = signal<BoardMember | null>(null);

  openRemoveConfirm(member: BoardMember): void {
    if (member.userId === CURRENT_USER_ID && this.isLastAdmin(member)) {
      this.flash('Không thể rời dự án — bạn là Admin duy nhất. Hãy chuyển quyền Admin cho người khác trước.', 'error');
      return;
    }
    this.memberToRemove.set(member);
  }

  closeRemoveConfirm(): void {
    this.memberToRemove.set(null);
  }

  confirmRemove(): void {
    const member = this.memberToRemove();
    if (!member) return;
    this.project.update((p) => (p ? { ...p, members: p.members.filter((m) => m.userId !== member.userId) } : p));
    this.flash(`Đã gỡ ${member.name} khỏi dự án.`, 'success');
    this.memberToRemove.set(null);
  }

  // ---- Invite member ----
  readonly showInviteModal = signal(false);
  readonly inviteEmail = signal('');
  readonly inviteRole = signal<BoardRole>('member');

  openInviteModal(): void {
    this.inviteEmail.set('');
    this.inviteRole.set('member');
    this.showInviteModal.set(true);
  }

  closeInviteModal(): void {
    this.showInviteModal.set(false);
  }

  submitInvite(): void {
    const email = this.inviteEmail().trim();
    if (!email || !email.includes('@')) {
      this.flash('Vui lòng nhập email hợp lệ.', 'error');
      return;
    }
    this.project.update((p) => {
      if (!p) return p;
      const invitation = {
        id: `inv${Date.now()}`,
        email,
        role: this.inviteRole(),
        invitedBy: 'Bạn',
        invitedAt: new Date().toISOString().slice(0, 10),
      };
      return { ...p, pendingInvitations: [invitation, ...p.pendingInvitations] };
    });
    this.flash(`Đã gửi lời mời tới ${email}.`, 'success');
    this.closeInviteModal();
  }

  revokeInvitation(id: string): void {
    this.project.update((p) => (p ? { ...p, pendingInvitations: p.pendingInvitations.filter((i) => i.id !== id) } : p));
    this.flash('Đã thu hồi lời mời.', 'info');
  }

  // ---- Join requests ----
  approveJoinRequest(id: string): void {
    this.project.update((p) => {
      if (!p) return p;
      const request = p.joinRequests.find((r) => r.id === id);
      if (!request) return p;
      const newMember: BoardMember = {
        userId: request.userId,
        name: request.name,
        email: request.email,
        avatarUrl: request.avatarUrl,
        role: 'member',
        assignedCards: [],
      };
      return {
        ...p,
        members: [...p.members, newMember],
        joinRequests: p.joinRequests.filter((r) => r.id !== id),
      };
    });
    this.flash('Đã duyệt yêu cầu tham gia.', 'success');
  }

  rejectJoinRequest(id: string): void {
    this.project.update((p) => (p ? { ...p, joinRequests: p.joinRequests.filter((r) => r.id !== id) } : p));
    this.flash('Đã từ chối yêu cầu tham gia.', 'info');
  }

  // ---- Toasts ----
  private toastSeq = 0;
  readonly toasts = signal<Toast[]>([]);

  private flash(message: string, type: ToastType = 'info'): void {
    const id = ++this.toastSeq;
    this.toasts.update((list) => [...list, { id, message, type }]);
    setTimeout(() => this.toasts.update((list) => list.filter((t) => t.id !== id)), 3000);
  }

  trackByUserId = (_: number, item: BoardMember) => item.userId;
  trackByInvitationId = (_: number, item: { id: string }) => item.id;
}
