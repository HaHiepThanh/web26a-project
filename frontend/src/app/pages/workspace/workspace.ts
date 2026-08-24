import { Component, DestroyRef, HostListener, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { LucideBuilding2, LucideGlobe, LucideLock, LucideSearch, LucideStar, LucideX,
  LucidePlus,
} from '@lucide/angular';
import { WorkspaceUiService } from '../../services/workspace-ui.service';
import { BoardService } from '../../services/board.service';
import { AuthService } from '../../services/auth.service';
import { OrganizationService } from '../../services/organization.service';
import { WorkspaceService } from '../../services/workspace.service';
import {
  Board,
  BoardBackground,
  BoardVisibility,
  OrgInviteRole,
  OrgMemberView,
  Role,
  Toast,
  ToastType,
  User,
  WorkspaceVisibility,
} from '../../models';
import {
  WorkspaceItem,
  WorkspaceMember,
  BoardItem,
  Privacy,
  initialMockWorkspaces,
  loadStoredWorkspaces,
  persistWorkspaces,
  WORKSPACE_TEMPLATES,
  Template,
} from '../../mocks';
import { OrgSwitcher } from '../../components/workspace/org-switcher/org-switcher';
import { OrgCreateModal } from '../../components/workspace/org-create-modal/org-create-modal';
import { OrgManageModal } from '../../components/workspace/org-manage-modal/org-manage-modal';
import { WorkspaceSidebar } from '../../components/workspace/workspace-sidebar/workspace-sidebar';
import { WorkspaceWelcomeBanner } from '../../components/workspace/workspace-welcome-banner/workspace-welcome-banner';
import { WorkspaceCardItem } from '../../components/workspace/workspace-card-item/workspace-card-item';
import { CreateBoardModal } from '../../components/workspace/create-board-modal/create-board-modal';
import { BoardEditModal } from '../../components/workspace/board-edit-modal/board-edit-modal';
import { WorkspaceFormModal } from '../../components/workspace/workspace-form-modal/workspace-form-modal';


/** 3 lựa chọn trên giao diện khớp 1-1 với 3 giá trị backend nhận. */
function toBoardVisibility(privacy: Privacy): BoardVisibility {
  return privacy.toLowerCase() as BoardVisibility;
}

/** Chiều ngược lại — dựng lại lựa chọn hiển thị từ giá trị backend trả về. */
function toPrivacy(visibility: string): Privacy {
  if (visibility === 'private') return 'Private';
  if (visibility === 'public') return 'Public';
  return 'Workspace';
}

@Component({
  selector: 'app-workspace',
  imports: [
    OrgSwitcher,
    OrgCreateModal,
    OrgManageModal,
    WorkspaceSidebar,
    WorkspaceWelcomeBanner,
    WorkspaceCardItem,
    CreateBoardModal,
    BoardEditModal,
    WorkspaceFormModal,
    LucideBuilding2,
    LucideGlobe,
    LucideLock,
    LucidePlus,
    LucideSearch,
    LucideStar,
    LucideX,
  ],
  templateUrl: './workspace.html',
  styleUrl: './workspace.css',
  host: { class: 'block h-full min-h-0 flex-1 overflow-hidden' },
})
export class Workspace {
  private readonly workspaceUi = inject(WorkspaceUiService);
  private readonly boardService = inject(BoardService);
  private readonly auth = inject(AuthService);
  private readonly orgService = inject(OrganizationService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly router = inject(Router);

  private readonly orgManageModal = viewChild(OrgManageModal);

  readonly currentUser = this.auth.currentUser;
  readonly copiedMyUuid = signal(false);

  // ---- Organization (multi-tenant): mỗi Organization có Workspace/Board riêng ----
  readonly organizations = this.orgService.organizations;
  readonly activeOrg = this.orgService.activeOrg;

  /**
   * Được quản lý workspace/board không (owner hoặc admin của tổ chức)?
   *
   * Chỉ dùng để ẨN NÚT cho gọn — backend mới là nơi thật sự chặn
   * (`assertCanManage` trong workspaces/boards service). Ẩn nút mà không chặn
   * ở server thì người dùng vẫn gọi thẳng API bằng token của họ được.
   */
  readonly canManage = this.orgService.isAdminOrOwner;

  readonly workspaces = signal<WorkspaceItem[]>([]);
  /** Đã nạp xong danh sách workspace lần đầu chưa — nút "+ Tạo" ở Header phải
   *  chờ mốc này, nếu không nó không biết tổ chức đã có workspace nào hay chưa. */
  readonly workspacesReady = signal(false);
  readonly activeWorkspaceId = signal<string | null>(null);
  readonly templates = WORKSPACE_TEMPLATES;
  readonly searchQuery = this.workspaceUi.searchQuery;

  // Confirm delete key for board popover
  readonly confirmDeleteKey = signal<string | null>(null);

  // Modals state
  readonly showCreateBoardModal = signal(false);
  readonly createBoardInitialWorkspaceId = signal<string | null>(null);
  readonly createBoardInitialTitle = signal('');

  readonly showWorkspaceModal = signal(false);
  readonly workspaceModalMode = signal<'create' | 'edit'>('create');
  readonly selectedWorkspaceForEdit = signal<WorkspaceItem | null>(null);

  readonly showBoardEditModal = signal(false);
  readonly editingBoard = signal<{ workspaceId: string; board: BoardItem } | null>(null);

  // Computed views
  readonly totalBoardsCount = computed(() => {
    return this.workspaces().reduce((sum, ws) => sum + ws.boards.length, 0);
  });

  /** Ảnh nền theo boardId — nguồn duy nhất là BoardService, tile chỉ tra để vẽ. */
  readonly bgImageByBoardId = this.boardService.backgroundImageByBoardId;

  readonly starredBoards = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const activeId = this.activeWorkspaceId();
    const result: (BoardItem & { workspaceId: string; workspaceName: string })[] = [];

    for (const ws of this.workspaces()) {
      if (activeId && ws.id !== activeId) continue;
      for (const b of ws.boards) {
        if (b.starred) {
          if (!query || b.title.toLowerCase().includes(query) || ws.name.toLowerCase().includes(query)) {
            result.push({ ...b, workspaceId: ws.id, workspaceName: ws.name });
          }
        }
      }
    }
    return result;
  });

  readonly filteredWorkspaces = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const activeId = this.activeWorkspaceId();

    let list = this.workspaces();
    if (activeId) {
      list = list.filter((ws) => ws.id === activeId);
    }
    if (!query) return list;

    return list
      .map((ws) => {
        const matchesWs = ws.name.toLowerCase().includes(query);
        const matchedBoards = ws.boards.filter((b) => b.title.toLowerCase().includes(query));
        if (matchesWs) return ws;
        if (matchedBoards.length > 0) return { ...ws, boards: matchedBoards };
        return null;
      })
      .filter((ws): ws is WorkspaceItem => ws !== null);
  });

  /** Tên workspace đang lọc — tiêu đề trang hiển thị nó thay cho câu chung chung. */
  readonly activeWorkspaceName = computed(() => {
    const id = this.activeWorkspaceId();
    if (!id) return '';
    return this.workspaces().find((ws) => ws.id === id)?.name ?? 'Không gian làm việc';
  });

  readonly searchHasNoResults = computed(() => {
    const q = this.searchQuery().trim();
    if (!q) return false;
    return this.filteredWorkspaces().length === 0 && this.starredBoards().length === 0;
  });

  constructor() {
    // Nạp lại danh sách Workspace mỗi khi user đăng nhập/đổi tài khoản HOẶC chuyển
    // Organization — đây là chỗ khiến việc switch Organization thực sự đổi dữ liệu
    // hiển thị (mỗi Organization có key localStorage Workspace riêng).
    effect(() => {
      const userId = this.currentUser()?.id;
      const orgId = this.orgService.activeOrgId();
      void this.loadWorkspaces(userId, orgId);
    });

    // MỘT effect cho cả hai nút "+ Tạo" ở Header — không thể mở nhầm hai modal.
    //
    // Hai chi tiết quan trọng:
    //
    //  • Chờ `workspacesReady()` rồi mới mở. `openCreateBoard()` cần biết đã có
    //    workspace nào chưa; gọi lúc danh sách còn rỗng thì nó tưởng là chưa có
    //    workspace nào và mở nhầm modal "Tạo Không gian làm việc".
    //
    //  • Phần mở modal nằm trong `untracked()`. Không có nó thì effect ĐỌC
    //    `workspaces()` bên trong `openCreateBoard()` → `workspaces` thành phụ
    //    thuộc → dữ liệu nạp xong effect chạy LẠI và mở thêm modal thứ hai.
    //    Đây chính là lý do bấm một nút mà hiện hai hộp thoại.
    effect(() => {
      const req = this.workspaceUi.pendingRequest();
      if (!req || !this.workspacesReady()) return;

      untracked(() => {
        this.workspaceUi.consumeRequest();
        if (req === 'create-board') this.openCreateBoard();
        else this.openCreateWorkspace();
      });
    });

    // Rời trang mà yêu cầu chưa kịp xử lý (đổi tổ chức, bấm Back ngay) thì bỏ đi
    // — để dành sẽ bật modal ở lần mở trang sau, đúng cái lỗi vừa sửa.
    inject(DestroyRef).onDestroy(() => this.workspaceUi.clearRequest());
  }

  @HostListener('window:keydown.escape')
  onEsc(): void {
    this.closeAllModals();
  }

  closeAllModals(): void {
    this.showCreateBoardModal.set(false);
    this.showWorkspaceModal.set(false);
    this.closeManageOrg();
    this.confirmDeleteKey.set(null);
  }

  /**
   * Nạp workspace VÀ board — cả hai đều từ backend.
   *
   * Mỗi workspace là một request `GET /boards?workspaceId=`, chạy song song.
   * Còn giữ ở localStorage đúng 2 thứ backend chưa lưu được: MÀU NỀN và ẢNH NỀN
   * của board (`POST /boards` chỉ nhận workspaceId + name).
   */
  private async loadWorkspaces(userId: string | undefined, orgId: string | null): Promise<void> {
    this.activeWorkspaceId.set(null);
    if (!userId || !orgId) {
      this.workspaces.set([]);
      // Vẫn coi là "nạp xong": không có tổ chức thì cũng không có gì để chờ nữa,
      // và nút "+ Tạo" phải phản hồi được thay vì im lặng.
      this.workspacesReady.set(true);
      return;
    }

    await this.workspaceService.loadWorkspaces(orgId);
    const loadError = this.workspaceService.loadError();
    if (loadError) {
      this.addToast(loadError, 'error');
      this.workspaces.set([]);
      this.workspacesReady.set(true);
      return;
    }

    const localItems = loadStoredWorkspaces(userId, orgId);
    const serverWorkspaces = this.workspaceService.workspaces();

    // Board của từng workspace — gọi song song, không nối tiếp.
    //
    // ⚠️ KHÔNG lặp `loadBoards(w.id)` rồi đọc `boards()` trong cùng vòng map:
    // `boards` là MỘT signal dùng chung, ba lời gọi song song ghi đè lẫn nhau nên
    // cả ba lần đọc đều nhận về board của workspace hoàn tất sau cùng — mọi
    // workspace hiện y hệt một danh sách. `loadAllBoards` gom sẵn theo lô rồi
    // mới lọc, nên không có chuyện đó.
    await this.boardService.loadAllBoards(serverWorkspaces.map((w) => w.id));
    const allBoards = this.boardService.allBoards();
    const boardsPerWorkspace = serverWorkspaces.map((w) =>
      allBoards.filter((b) => b.workspaceId === w.id),
    );

    // Roster thành viên tổ chức — dùng để dựng danh sách thành viên của workspace
    // mà không phải gọi thêm API cho từng cái.
    const orgRoster = this.orgService.membersOf(orgId);
    const byId = new Map(orgRoster.map((m) => [m.user.id, m.user]));

    this.workspaces.set(
      serverWorkspaces.map((w, i) => {
        const local = localItems.find((c) => c.id === w.id);

        // Workspace mở cho cả tổ chức → thành viên là toàn bộ tổ chức.
        // Workspace chỉ định → đúng những người trong memberIds.
        const ids = w.visibility === 'restricted' ? w.memberIds : orgRoster.map((m) => m.user.id);
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

        return {
          id: w.id,
          name: w.name,
          // Mô tả giờ lấy từ SERVER (trước đây chỉ đọc localStorage nên mở máy
          // khác là mất trắng); bản local chỉ dùng làm phương án dự phòng.
          description: w.description || local?.description || '',
          visibility: w.visibility,
          memberIds: w.memberIds,
          membersCount: members.length || ids.length,
          members,
          boards: boardsPerWorkspace[i].map((b) => this.toBoardItem(b, w.name, local)),
        };
      }),
    );
    this.workspacesReady.set(true);
  }

  /** Board từ backend → thẻ hiển thị. Màu nền và cờ sao còn ở localStorage nên
   *  lấy lại từ bản cũ (nếu có) để F5 không mất. */
  private toBoardItem(b: Board, workspaceName: string, local?: WorkspaceItem): BoardItem {
    const old = local?.boards.find((x) => x.id === b.id);
    return {
      id: b.id,
      title: b.name,
      tag: workspaceName.toUpperCase(),
      privacy: toPrivacy(b.visibility),
      badge: 'KANBAN',
      starred: old?.starred ?? false,
      bgClass: b.background ?? old?.bgClass ?? 'bg-board-blue',
    };
  }

  /** Lưu phần dữ liệu CÒN Ở LOCAL (board, thành viên workspace) — tên/mô tả đã
   *  nằm trên server rồi, không cần lưu lại ở đây. */
  private persist(list: WorkspaceItem[]): void {
    persistWorkspaces(list, this.currentUser()?.id, this.orgService.activeOrgId());
  }

  // ---- Organization (multi-tenant) actions ----
  switchOrg(orgId: string): void {
    this.orgService.switchOrg(orgId);
  }

  // ---- Modal Tạo Organization mới ----
  readonly showOrgCreateModal = signal(false);

  /** Slug đã bị chiếm hay chưa thì CHỈ backend biết (nó giữ tổ chức của mọi người,
   *  trình duyệt này chỉ thấy tổ chức của user đang đăng nhập). Modal vì thế không
   *  cảnh báo lúc gõ nữa — bấm Tạo, backend trả 409 kèm câu tiếng Việt sẵn. */

  async createOrg(data: { name: string; slug: string }): Promise<void> {
    const { org, error } = await this.orgService.createOrg(data.name, data.slug);
    if (!org) {
      this.addToast(error ?? 'Không tạo được tổ chức, thử lại nhé!', 'error');
      return;
    }
    this.addToast(`Đã tạo tổ chức "${org.name}" tại /${org.slug}`, 'success');
    void this.router.navigate(['/', org.slug, 'workspace']);
  }

  // ---- Modal quản lý Organization (mở từ nút 3 chấm ở sidebar) ----
  readonly showOrgManageModal = signal(false);
  readonly managingOrgId = signal<string | null>(null);

  readonly managingOrg = computed(
    () => this.organizations().find((o) => o.id === this.managingOrgId()) ?? null,
  );

  /** Thành viên của tổ chức đang mở trong modal.
   *  Tên/email lấy thẳng từ backend (GET /organizations/:id/members đã join sang
   *  bảng users), không còn phải dò trong danh sách mock ở localStorage. */
  readonly managingOrgMembers = computed<OrgMemberView[]>(() =>
    this.orgService.membersOf(this.managingOrgId()),
  );

  readonly managingOrgInvites = computed(() => {
    const org = this.managingOrg();
    return org ? this.orgService.pendingInvitesFor(org.id) : [];
  });

  openManageOrg(orgId: string): void {
    this.managingOrgId.set(orgId);
    this.showOrgManageModal.set(true);
  }

  closeManageOrg(): void {
    this.showOrgManageModal.set(false);
    this.managingOrgId.set(null);
  }

  async inviteMember(data: { orgId: string; uuid: string; role: OrgInviteRole }): Promise<void> {
    const error = await this.orgService.inviteMember(data.orgId, data.uuid, data.role);
    const quyen = data.role === 'admin' ? 'quản trị viên' : 'thành viên';
    this.orgManageModal()?.showResult(
      error,
      `Đã gửi lời mời (vào với quyền ${quyen})! Chờ họ đồng ý ở chuông thông báo.`,
    );
    if (!error) this.addToast(`📨 Đã gửi lời mời làm ${quyen}!`, 'success');
  }

  async removeOrgMember(data: { orgId: string; userId: string }): Promise<void> {
    const member = this.managingOrgMembers().find((m) => m.user.id === data.userId);
    const name = member?.user.displayName ?? member?.user.email ?? 'thành viên';
    const error = await this.orgService.removeMember(data.orgId, data.userId);
    this.orgManageModal()?.showResult(error, `Đã xoá ${name} khỏi tổ chức.`);
    if (!error) this.addToast(`Đã xoá ${name} khỏi tổ chức.`, 'info');
  }

  async changeOrgMemberRole(data: { orgId: string; userId: string; role: Role }): Promise<void> {
    const member = this.managingOrgMembers().find((m) => m.user.id === data.userId);
    const name = member?.user.displayName ?? member?.user.email ?? 'thành viên';
    const quyen = data.role === 'admin' ? 'Quản trị' : 'Thành viên';
    const error = await this.orgService.changeRole(data.orgId, data.userId, data.role);
    this.orgManageModal()?.showResult(error, `Đã đổi ${name} thành ${quyen}.`);
    if (!error) this.addToast(`Đã đổi quyền của ${name} thành ${quyen}.`, 'success');
  }

  async cancelOrgInvite(inviteId: string): Promise<void> {
    const error = await this.orgService.cancelInvite(inviteId);
    this.orgManageModal()?.showResult(error, 'Đã huỷ lời mời.');
  }

  async renameOrg(data: { orgId: string; name: string }): Promise<void> {
    const error = await this.orgService.updateOrg(data.orgId, { name: data.name });
    this.orgManageModal()?.showResult(error, 'Đã cập nhật thông tin tổ chức.');
    if (!error) this.addToast(`Đã cập nhật tổ chức "${data.name}".`, 'success');
  }

  copyMyUuid(): void {
    const uid = this.currentUser()?.id;
    if (!uid) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(uid);
      this.copiedMyUuid.set(true);
      this.addToast(`Đã sao chép UUID của bạn: ${uid}`, 'success');
      setTimeout(() => this.copiedMyUuid.set(false), 2500);
    }
  }

  selectWorkspace(id: string | null): void {
    this.activeWorkspaceId.set(id);
  }

  loadSampleWorkspaces(): void {
    const samples = initialMockWorkspaces();
    this.workspaces.set(samples);
    this.persist(samples);
    this.activeWorkspaceId.set(null);
    this.addToast('Đã tải lại toàn bộ Workspace mẫu thành công!', 'success');
  }

  onBoardClick(board: BoardItem): void {
    void this.router.navigate(['/', this.orgService.activeOrgSlug(), 'board', board.id]);
  }

  toggleStar(boardId: string): void {
    this.workspaces.update((list) => {
      const updated = list.map((ws) => ({
        ...ws,
        boards: ws.boards.map((b) => (b.id === boardId ? { ...b, starred: !b.starred } : b)),
      }));
      this.persist(updated);
      return updated;
    });
  }

  async deleteBoard(payload: { workspaceId: string; board: BoardItem }): Promise<void> {
    const { workspaceId, board } = payload;

    // Xoá trên server TRƯỚC. Backend chỉ cho owner/admin xoá board — xoá khỏi
    // giao diện trước rồi mới biết bị 403 thì bảng biến mất rồi lại hiện lại.
    const error = await this.boardService.deleteBoard(board.id);
    if (error) {
      this.addToast(error, 'error');
      return;
    }

    this.workspaces.update((list) => {
      const updated = list.map((ws) =>
        ws.id === workspaceId ? { ...ws, boards: ws.boards.filter((b) => b.id !== board.id) } : ws,
      );
      this.persist(updated);
      return updated;
    });
    this.addToast(`Đã xóa bảng "${board.title}"`, 'info');
  }

  // ---- Board Edit Modal ----
  openEditBoard(payload: { workspaceId: string; board: BoardItem }): void {
    this.editingBoard.set(payload);
    this.showBoardEditModal.set(true);
  }

  async handleBoardEditSave(data: {
    boardId: string;
    title: string;
    background: BoardBackground;
    backgroundImageUrl?: string;
  }): Promise<void> {
    const { boardId, title, background, backgroundImageUrl } = data;
    const target = this.editingBoard();
    if (!target) return;

    const error = await this.boardService.updateBoard(boardId, {
      name: title,
      background,
      backgroundImageUrl,
    });
    if (error) {
      this.addToast(error, 'error');
      return;
    }

    this.workspaces.update((list) => {
      const updated = list.map((ws) =>
        ws.id === target.workspaceId
          ? { ...ws, boards: ws.boards.map((b) => (b.id === boardId ? { ...b, title, bgClass: background } : b)) }
          : ws,
      );
      this.persist(updated);
      return updated;
    });

    this.showBoardEditModal.set(false);
    this.editingBoard.set(null);
    this.addToast(`Đã lưu thay đổi cho bảng "${title}"!`, 'success');
    const warning = this.boardService.storageWarning();
    if (warning) this.addToast(warning, 'error');
  }

  // ---- Board Modal Actions ----
  openCreateBoard(defaultWorkspaceId: string | null = null): void {
    if (this.workspaces().length === 0) {
      this.addToast('Bạn cần tạo Workspace trước khi tạo bảng.', 'info');
      this.openCreateWorkspace();
      return;
    }
    this.createBoardInitialWorkspaceId.set(defaultWorkspaceId);
    this.createBoardInitialTitle.set('');
    this.showCreateBoardModal.set(true);
  }

  useTemplate(template: Template): void {
    if (this.workspaces().length === 0) {
      this.openCreateWorkspace();
      return;
    }
    this.createBoardInitialWorkspaceId.set(null);
    this.createBoardInitialTitle.set(template.title);
    this.showCreateBoardModal.set(true);
    this.addToast(`Đang tạo bảng từ mẫu "${template.title}"`);
  }

  async handleBoardSubmit(data: {
    title: string;
    workspaceId: string;
    privacy: Privacy;
    background: BoardBackground;
    backgroundImageUrl?: string;
    selectedMemberIds: string[];
  }): Promise<void> {
    const { title, workspaceId, privacy, background, backgroundImageUrl, selectedMemberIds } = data;
    const targetWorkspace = this.workspaces().find((w) => w.id === workspaceId);
    if (!targetWorkspace) return;

    const visibility = toBoardVisibility(privacy);
    const board = await this.boardService.createBoard(workspaceId, title, {
      visibility,
      // Chỉ gửi khi board đặt riêng tư — 'Workspace'/'Public' thì cả workspace
      // đều thấy nên danh sách chỉ định không có ý nghĩa.
      memberIds: visibility === 'private' ? selectedMemberIds : undefined,
      background,
      backgroundImageUrl,
    });
    if (!board) return;

    const newBoard: BoardItem = {
      id: board.id,
      title,
      tag: targetWorkspace.name.toUpperCase(),
      privacy,
      badge: 'KANBAN',
      starred: false,
      bgClass: background,
    };

    this.workspaces.update((list) => {
      const updated = list.map((ws) => (ws.id === workspaceId ? { ...ws, boards: [...ws.boards, newBoard] } : ws));
      this.persist(updated);
      return updated;
    });

    this.addToast(`Đã tạo bảng mới "${newBoard.title}"!`, 'success');
    const warning = this.boardService.storageWarning();
    if (warning) this.addToast(warning, 'error');
    this.showCreateBoardModal.set(false);
    void this.router.navigate(['/', this.orgService.activeOrgSlug(), 'board', board.id]);
  }

  // ---- Workspace Modal Actions ----
  openCreateWorkspace(): void {
    this.workspaceModalMode.set('create');
    this.selectedWorkspaceForEdit.set(null);
    this.showWorkspaceModal.set(true);
  }

  openEditWorkspace(ws: WorkspaceItem): void {
    this.workspaceModalMode.set('edit');
    this.selectedWorkspaceForEdit.set(ws);
    this.showWorkspaceModal.set(true);
  }

  async handleWorkspaceSave(data: {
    name: string;
    description: string;
    visibility: WorkspaceVisibility;
    memberIds: string[];
    members: WorkspaceMember[];
  }): Promise<void> {
    const { name, description, visibility, memberIds, members } = data;
    const orgId = this.orgService.activeOrgId();
    if (!orgId) return;

    if (this.workspaceModalMode() === 'create') {
      const { workspace, error } = await this.workspaceService.createWorkspace(
        orgId,
        name,
        description,
        visibility,
        memberIds,
      );
      if (!workspace) {
        this.addToast(error ?? 'Không tạo được workspace.', 'error');
        return;
      }
      // id lấy từ server, KHÔNG tự sinh 'ws-' + Date.now() nữa — id tự sinh sẽ
      // không khớp gì với database và mọi request sau đó đều 404.
      const newWs: WorkspaceItem = {
        id: workspace.id,
        name: workspace.name,
        visibility: workspace.visibility,
        memberIds: workspace.memberIds,
        membersCount: members.length,
        members,
        description: description || 'Không gian làm việc mới vừa được khởi tạo.',
        boards: [],
      };
      this.workspaces.update((list) => {
        const updated = [...list, newWs];
        this.persist(updated);
        return updated;
      });
      this.activeWorkspaceId.set(newWs.id);
      this.addToast(`🎉 Đã tạo Không gian làm việc "${newWs.name}"!`, 'success');
    } else {
      const editingWs = this.selectedWorkspaceForEdit();
      if (!editingWs) return;

      const error = await this.workspaceService.updateWorkspace(editingWs.id, {
        name,
        description,
        visibility,
        // Chỉ gửi danh sách khi thật sự chỉ định — gửi kèm lúc 'org' là thừa.
        ...(visibility === 'restricted' ? { memberIds } : {}),
      });
      if (error) {
        this.addToast(error, 'error');
        return;
      }
      this.workspaces.update((list) => {
        const updated = list.map((ws) =>
          ws.id === editingWs.id
            ? { ...ws, name, description, visibility, memberIds, members, membersCount: members.length }
            : ws,
        );
        this.persist(updated);
        return updated;
      });
      this.addToast(`Đã cập nhật Workspace "${name}"`, 'success');
    }
    this.showWorkspaceModal.set(false);
  }

  async handleWorkspaceDelete(wsId: string): Promise<void> {
    const ws = this.workspaces().find((w) => w.id === wsId);

    // Xoá trên server TRƯỚC. Xoá ở giao diện trước rồi server hỏng là danh sách
    // trên màn hình lệch với database cho tới lần F5 kế tiếp.
    const error = await this.workspaceService.deleteWorkspace(wsId);
    if (error) {
      this.addToast(error, 'error');
      return;
    }

    this.workspaces.update((list) => {
      const updated = list.filter((w) => w.id !== wsId);
      this.persist(updated);
      return updated;
    });
    if (this.activeWorkspaceId() === wsId) {
      this.activeWorkspaceId.set(null);
    }
    this.showWorkspaceModal.set(false);
    this.addToast(`Đã xóa Workspace "${ws?.name || ''}"`, 'info');
  }

  // ---- Toast notifications ----
  private toastSeq = 0;
  readonly toasts = signal<Toast[]>([]);

  addToast(message: string, type: 'success' | 'error' | 'info' = 'info', action?: { label: string; handler: () => void }): void {
    const id = ++this.toastSeq;
    this.toasts.update((list) => [...list, { id, message, type, action }]);
    setTimeout(() => {
      this.toasts.update((list) => list.filter((t) => t.id !== id));
    }, 3800);
  }

  removeToast(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
