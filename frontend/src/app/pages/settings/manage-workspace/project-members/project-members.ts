import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Role, Toast, ToastType } from '../../../../models';
import { avatarColorFor, initialsOf } from '../../../../utils/avatar.util';
import { AuthService } from '../../../../services/auth.service';
import { WorkspaceService } from '../../../../services/workspace.service';
import { BoardStore } from '../../../../ngrx/board/board.store';
import { CardStore } from '../../../../ngrx/card/card.store';
import { ListStore } from '../../../../ngrx/list/list.store';
import { OrganizationStore } from '../../../../ngrx/organization/organization.store';
import { ManageWorkspaceStore } from '../../../../ngrx/manage-workspace/manage-workspace.store';
import type { BoardMemberView } from '../../../../ngrx/manage-workspace/manage-workspace.state';
import {
  ASSIGNABLE_ROLES,
  AssignedCard,
  ProjectMember,
  roleBadge,
  roleLabel,
} from '../manage-workspace.models';
import { UserAvatar } from '../../../../components/shared/user-avatar/user-avatar';

type MembersTab = 'members' | 'invitations';

/**
 * Màn 2 — thành viên của một project (board) cụ thể.
 *
 * "Xem danh sách + xem thẻ đang giữ" là quyền chung của mọi thành viên; mọi thao
 * tác sửa chỉ hiện với owner/admin của TỔ CHỨC (bảng phân quyền ở `schema.md`).
 * Ẩn nút chỉ để cho gọn mắt — backend mới là nơi chặn thật (`assertCanManage`).
 *
 * ⚠️ Hai thao tác ở màn này chạm vào HAI phạm vi khác nhau, đừng lẫn:
 *
 *   • Thêm/bớt thành viên  → phạm vi BOARD (`PATCH /boards/:id` với `memberIds`),
 *     và CHỈ có tác dụng khi board là `private`. Board `workspace`/`public`
 *     không có danh sách thành viên riêng: ai ở trong workspace/tổ chức là vào
 *     được, nên với chúng phần này ẩn đi kèm câu giải thích.
 *   • Đổi vai trò          → phạm vi TỔ CHỨC (`PATCH /organizations/:id/members/
 *     :userId/role`). Đổi ở đây là đổi ở MỌI board, không riêng project này —
 *     giao diện phải nói rõ điều đó.
 *
 * Tab "Join Requests" của bản mock đã xoá: không có bảng, không có endpoint, và
 * không có dòng nào trong bảng phân quyền ở `schema.md` — hệ thống chỉ có luồng
 * MỜI (admin mời → chuông → người được mời bấm Đồng ý), không có luồng xin vào.
 */
@Component({
  selector: 'app-project-members',
  imports: [DatePipe, RouterLink, UserAvatar],
  templateUrl: './project-members.html',
  styleUrl: './project-members.css',
})
export class ProjectMembers {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly orgs = inject(OrganizationStore);
  private readonly boards = inject(BoardStore);
  private readonly cards = inject(CardStore);
  private readonly lists = inject(ListStore);
  private readonly workspaces = inject(WorkspaceService);
  private readonly boardMembers = inject(ManageWorkspaceStore);

  readonly roleLabel = roleLabel;
  readonly roleBadge = roleBadge;
  readonly assignableRoles = ASSIGNABLE_ROLES;
  readonly avatarColorFor = avatarColorFor;
  readonly initialsOf = initialsOf;

  private readonly boardId = this.route.snapshot.paramMap.get('boardId') ?? '';
  readonly currentUserId = computed(() => this.auth.currentUser()?.id ?? '');

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly activeTab = signal<MembersTab>('members');

  constructor() {
    effect(() => {
      // Chỉ chạy một lần: `boardId` lấy từ snapshot, route này không tái dùng
      // component cho id khác (mỗi lần vào là một lần khởi tạo mới).
      untracked(() => void this.bootstrap());
    });
  }

  private async bootstrap(): Promise<void> {
    if (!this.boardId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);

    // Phải có board TRƯỚC: mọi thứ còn lại cần `orgId`/`workspaceId` của nó.
    // 404 ở đây gộp cả "không tồn tại" lẫn "không thuộc tổ chức của mình" —
    // backend cố ý không phân biệt để người ngoài không dò được id nào có thật.
    await this.boards.loadBoard(this.boardId);
    const board = this.board();
    if (!board) {
      // Mất mạng KHÁC HẲN board không tồn tại. Không phân biệt là bảo người
      // dùng "không có project này" trong khi nó vẫn nằm nguyên trong database.
      this.loadError.set(this.boards.loadError());
      this.loading.set(false);
      return;
    }

    await Promise.all([
      this.workspaces.loadWorkspaces(board.orgId),
      this.boardMembers.loadBoardMembers(this.boardId, true),
      this.lists.loadLists(this.boardId),
      this.cards.loadCards(this.boardId, true),
    ]);
    // Chỉ owner/admin gọi được — thành viên thường nhận 403, và store đã nuốt
    // lỗi đó thành mảng rỗng, nhưng gọi thừa vẫn là một vòng mạng vô ích.
    if (this.isAdmin()) await this.orgs.loadPendingInvites(board.orgId);

    // Nạp thành viên hỏng thì bảng rỗng — mà bảng rỗng trông y hệt "project này
    // chưa có ai". Phải nói ra, không thì người dùng tin vào một danh sách sai.
    this.loadError.set(this.boardMembers.lastError()?.message ?? null);
    this.loading.set(false);
  }

  // ---- Board + ngữ cảnh ----

  readonly board = computed(() => this.boards.entities().find((b) => b.id === this.boardId) ?? null);

  readonly workspaceName = computed(() => {
    const b = this.board();
    if (!b) return '';
    return this.workspaces.workspaces().find((w) => w.id === b.workspaceId)?.name ?? 'Unknown workspace';
  });

  /**
   * Vai trò của tôi trong tổ chức CHỨA BOARD NÀY — cố ý không dùng
   * `OrganizationStore.myRole()`, vì cái đó bám theo tổ chức đang chọn trên URL,
   * còn route `/settings/manage-workspace/:boardId` không mang slug tổ chức.
   */
  readonly myRole = computed<Role | null>(() => {
    const b = this.board();
    return b ? (this.orgs.myRoleByOrg()[b.orgId] ?? null) : null;
  });

  readonly isAdmin = computed(() => {
    const r = this.myRole();
    return r === 'owner' || r === 'admin';
  });
  readonly isMember = computed(() => this.myRole() !== null);

  /** Chỉ board `private` mới có danh sách thành viên riêng để sửa — xem chú thích đầu lớp. */
  readonly isPrivateBoard = computed(() => this.board()?.visibility === 'private');
  readonly canEditMembers = computed(() => this.isAdmin() && this.isPrivateBoard());

  /** Người tạo board luôn được backend nhét lại vào danh sách (`locTheoWorkspace`),
   *  nên nút gỡ họ sẽ "thành công" mà chẳng gỡ được ai — ẩn đi cho khỏi bịp. */
  readonly boardCreatorId = computed(() => this.board()?.createdBy ?? '');

  /** Không có tab admin-only cho thành viên thường — trỏ vào đó thì về 'members'. */
  setTab(tab: MembersTab): void {
    if (tab === 'invitations' && !this.isAdmin()) {
      this.activeTab.set('members');
      return;
    }
    this.activeTab.set(tab);
  }

  // ---- Danh sách thành viên + tìm kiếm + bung thẻ được giao ----

  readonly searchQuery = signal('');
  readonly expandedMemberId = signal<string | null>(null);
  readonly busyUserId = signal<string | null>(null);

  /**
   * Đang có một lệnh ghi danh sách thành viên bay dở.
   *
   * Khác `busyUserId` (chỉ để làm mờ đúng một dòng): cờ này khoá MỌI nút thêm/gỡ,
   * vì `PATCH /boards/:id` thay cả tập nên hai lệnh chồng nhau sẽ nuốt mất người
   * vừa thêm — xem chú thích dài trong `manage-workspace.methods.ts`.
   */
  readonly savingMembership = signal(false);

  readonly members = computed<ProjectMember[]>(() => {
    const b = this.board();
    if (!b) return [];

    const roleByUser: Record<string, Role> = {};
    for (const m of this.orgs.membersOf(b.orgId)) roleByUser[m.user.id] = m.role;

    const listNames: Record<string, string> = {};
    for (const l of this.lists.lists()) listNames[l.id] = l.name;

    const cardsByAssignee: Record<string, AssignedCard[]> = {};
    for (const c of this.cards.entities()) {
      if (!c.assigneeId) continue;
      (cardsByAssignee[c.assigneeId] ??= []).push({
        id: c.id,
        title: c.title,
        listName: listNames[c.listId] ?? 'Unknown list',
        dueDate: c.dueDate ?? null,
      });
    }

    return this.boardMembers.membersOf(b.id).map((m) => ({
      userId: m.userId,
      name: this.nameOf(m),
      email: m.user?.email ?? '',
      avatarUrl: m.user?.avatarUrl ?? null,
      role: roleByUser[m.userId] ?? null,
      assignedCards: cardsByAssignee[m.userId] ?? [],
    }));
  });

  readonly filteredMembers = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.members();
    return this.members().filter(
      (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  });

  /** Người dùng có thể chưa từng đặt tên hiển thị — rơi về email, rồi tới uid. */
  private nameOf(m: BoardMemberView): string {
    return m.user?.displayName || m.user?.email || m.userId;
  }

  toggleExpandedCards(userId: string): void {
    this.expandedMemberId.update((cur) => (cur === userId ? null : userId));
  }

  // ---- Đổi vai trò (phạm vi TỔ CHỨC) ----

  /** Vai trò `owner` không đổi qua màn này (chuyển quyền owner phải hạ owner cũ
   *  trong cùng transaction), và không ai tự đổi vai của chính mình — tự hạ
   *  xuống `member` là mất luôn quyền vào lại đây. */
  canChangeRole(member: ProjectMember): boolean {
    return this.isAdmin() && member.role !== 'owner' && member.userId !== this.currentUserId();
  }

  /**
   * `select` truyền vào để TRẢ LẠI khi API từ chối.
   *
   * Ô chọn buộc một chiều (`[value]` + `(change)`), nên sau khi người dùng chọn,
   * DOM đã mang giá trị mới còn `member.role` thì chưa. Gọi API hỏng (403, mạng
   * đứt) mà không tự tay đặt lại `el.value` thì Angular KHÔNG vẽ lại — dữ liệu
   * không đổi thì không có gì để vẽ — và ô chọn nằm lại ở vai trò chưa bao giờ
   * được lưu. Người dùng nhìn thấy "Admin" trong khi database vẫn là "Member".
   */
  async onChangeRole(member: ProjectMember, role: Role, el: HTMLSelectElement): Promise<void> {
    const b = this.board();
    if (!b || role === member.role) return;
    this.busyUserId.set(member.userId);
    const error = await this.orgs.changeRole(b.orgId, member.userId, role);
    this.busyUserId.set(null);
    if (error) {
      el.value = member.role ?? '';
      this.flash(error, 'error');
      return;
    }
    this.flash(`${member.name} is now ${roleLabel(role)} in this organization.`, 'success');
  }

  // ---- Gỡ khỏi project (phạm vi BOARD, chỉ board private) ----

  readonly memberToRemove = signal<ProjectMember | null>(null);

  canRemove(member: ProjectMember): boolean {
    if (!this.canEditMembers()) return false;
    if (member.userId === this.boardCreatorId()) return false;
    // Cho phép tự rời project
    if (member.userId === this.currentUserId()) return true;
    const role = this.myRole();
    if (role === 'owner') return true;
    if (role === 'admin') return member.role === 'member';
    return false;
  }

  openRemoveConfirm(member: ProjectMember): void {
    this.memberToRemove.set(member);
  }

  closeRemoveConfirm(): void {
    this.memberToRemove.set(null);
  }

  async confirmRemove(): Promise<void> {
    const member = this.memberToRemove();
    const b = this.board();
    if (!member || !b) return;
    this.memberToRemove.set(null);
    this.busyUserId.set(member.userId);
    this.savingMembership.set(true);

    // `PATCH /boards/:id` thay THẲNG cả tập, nên gửi danh sách đầy đủ sau khi bớt.
    const next = this.boardMembers.membersOf(b.id).filter((m) => m.userId !== member.userId);
    const error = await this.boardMembers.setBoardMembers(b.id, next);
    this.busyUserId.set(null);
    this.savingMembership.set(false);

    if (error) {
      this.flash(error, 'error');
      return;
    }

    // Tự rời board thì từ giây này ta KHÔNG còn quyền xem nó nữa: ở lại là ngồi
    // trên một trang mà lần tải lại kế tiếp sẽ trả 404. Về thẳng danh sách.
    if (member.userId === this.currentUserId()) {
      void this.router.navigateByUrl('/settings/manage-workspace');
      return;
    }
    this.flash(`Removed ${member.name} from this project.`, 'success');
  }

  // ---- Thêm vào project (phạm vi BOARD, chỉ board private) ----

  readonly showAddModal = signal(false);
  readonly loadingCandidates = signal(false);
  readonly candidateQuery = signal('');
  private readonly candidates = signal<BoardMemberView[]>([]);

  readonly filteredCandidates = computed(() => {
    const q = this.candidateQuery().trim().toLowerCase();
    if (!q) return this.candidates();
    return this.candidates().filter((c) => this.nameOf(c).toLowerCase().includes(q));
  });

  candidateName(c: BoardMemberView): string {
    return this.nameOf(c);
  }

  /**
   * Vùng chọn là THÀNH VIÊN WORKSPACE, không phải thành viên tổ chức.
   *
   * Backend quyết định vùng đó (`GET /workspaces/:id/members` trả thành viên tổ
   * chức khi workspace mở, hoặc đúng `workspace_members` khi workspace hạn chế)
   * và từ chối luôn nếu ta gửi người ngoài vùng — nên hỏi nó thay vì tự suy ra
   * từ danh sách tổ chức, cách đó sẽ xổ ra cả người không vào được workspace.
   */
  async openAddModal(): Promise<void> {
    const b = this.board();
    if (!b) return;
    this.candidateQuery.set('');
    this.candidates.set([]);
    this.showAddModal.set(true);
    this.loadingCandidates.set(true);

    const rows = await this.workspaces.loadMembers(b.workspaceId);
    const already = new Set(this.boardMembers.membersOf(b.id).map((m) => m.userId));
    this.candidates.set(
      rows
        .filter((r) => !already.has(r.userId))
        .map((r) => ({
          userId: r.userId,
          user: r.user
            ? {
                id: r.user.id,
                email: r.user.email,
                displayName: r.user.displayName ?? undefined,
                avatarUrl: r.user.avatarUrl ?? undefined,
              }
            : null,
        })),
    );
    this.loadingCandidates.set(false);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
  }

  async addMember(candidate: BoardMemberView): Promise<void> {
    const b = this.board();
    if (!b) return;
    this.busyUserId.set(candidate.userId);
    this.savingMembership.set(true);
    const next = [...this.boardMembers.membersOf(b.id), candidate];
    const error = await this.boardMembers.setBoardMembers(b.id, next);
    this.busyUserId.set(null);
    this.savingMembership.set(false);

    if (error) {
      this.flash(error, 'error');
      return;
    }
    this.candidates.update((list) => list.filter((c) => c.userId !== candidate.userId));
    this.flash(`Added ${this.nameOf(candidate)} to this project.`, 'success');
  }

  // ---- Lời mời tổ chức đang chờ (phạm vi TỔ CHỨC) ----

  readonly pendingInvites = computed(() => {
    const b = this.board();
    return b ? this.orgs.pendingInvitesFor(b.orgId) : [];
  });

  async revokeInvitation(inviteId: string): Promise<void> {
    const b = this.board();
    if (!b) return;
    const error = await this.orgs.cancelInvite(inviteId);
    if (error) {
      this.flash(error, 'error');
      return;
    }
    // `cancelInvite` nạp lại theo tổ chức đang chọn trên URL, còn route này không
    // có slug tổ chức — nạp lại đúng tổ chức của board cho chắc.
    await this.orgs.loadPendingInvites(b.orgId);
    this.flash('Invitation revoked.', 'info');
  }

  // ---- Toast ----

  private toastSeq = 0;
  readonly toasts = signal<Toast[]>([]);

  private flash(message: string, type: ToastType = 'info'): void {
    const id = ++this.toastSeq;
    this.toasts.update((list) => [...list, { id, message, type }]);
    setTimeout(() => this.toasts.update((list) => list.filter((t) => t.id !== id)), 3000);
  }

  trackByUserId = (_: number, item: ProjectMember) => item.userId;
  trackByInvitationId = (_: number, item: { id: string }) => item.id;
}
