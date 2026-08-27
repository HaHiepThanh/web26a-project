import { Component, DestroyRef, HostListener, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { LucideBuilding2, LucideGlobe, LucideLock, LucidePlus, LucideSearch, LucideStar, LucideX } from '@lucide/angular';
import { WorkspaceUiService } from '../../services/workspace-ui.service';
import { BoardStore } from '../../ngrx/board/board.store';
import { AuthService } from '../../services/auth.service';
import { OrganizationStore } from '../../ngrx/organization/organization.store';
import { WorkspaceService } from '../../services/workspace.service';
import { BoardPrefsStore } from '../../ngrx/board-prefs/board-prefs.store';
import { TourStore } from '../../ngrx/tour/tour.store';
import {
  Board,
  BoardBackground,
  BoardVisibility,
  Organization,
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
import { WorkspaceDeleteModal } from '../../components/workspace/workspace-delete-modal/workspace-delete-modal';
import { OrgDeleteModal } from '../../components/workspace/org-delete-modal/org-delete-modal';


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
    WorkspaceDeleteModal,
    OrgDeleteModal,
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
  private readonly boardService = inject(BoardStore);
  private readonly auth = inject(AuthService);
  readonly orgService = inject(OrganizationStore);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly boardPrefs = inject(BoardPrefsStore);
  private readonly tour = inject(TourStore);
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

  /**
   * Đang có một lượt tạo board chạy dở hay chưa.
   *
   * `handleBoardSubmit` phải `await` backend, mà modal chỉ đóng SAU khi có kết
   * quả. Trong khoảng chờ đó nút "Create board" vẫn bấm được, nên double-click
   * (hoặc chuột bị nhảy đúp) bắn thêm nguyên một request nữa — mỗi request tạo
   * một board thật, giống hệt nhau. Người dùng đã gặp: bấm nhanh mấy lần ra
   * một loạt board trùng tên.
   *
   * Cờ này là chốt chặn thật; nút bị `disabled` chỉ là phần nhìn thấy được.
   * Giữ cả hai vì chúng chặn hai đường khác nhau: `disabled` lo chuột, còn cờ
   * lo mọi đường còn lại (Enter trong form, sự kiện đến sát nhau trước khi
   * Angular kịp vẽ lại nút).
   */
  readonly creatingBoard = signal(false);

  readonly showWorkspaceModal = signal(false);
  readonly workspaceModalMode = signal<'create' | 'edit'>('create');
  readonly selectedWorkspaceForEdit = signal<WorkspaceItem | null>(null);

  /** Hộp thoại xác nhận xoá workspace (phải gõ lại đúng tên mới bấm được). */
  readonly showDeleteWorkspaceModal = signal(false);
  readonly workspacePendingDelete = signal<WorkspaceItem | null>(null);
  readonly deletingWorkspace = signal(false);
  readonly deleteWorkspaceError = signal<string | null>(null);

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

    // ---- Tour hướng dẫn người dùng mới ----
    //
    // Báo số lượng về TourStore. Tour chuyển bước theo DỮ LIỆU chứ không theo cú
    // bấm: bấm nút rồi API trả lỗi thì tour phải đứng yên, không được hớn hở đi
    // tiếp rồi trỏ vào một cái board không tồn tại.
    //
    // ⚠️ `observe()` phải nằm trong `untracked()`. Bên trong nó ĐỌC `counts()`
    //    rồi GHI lại chính `counts` — gọi trần trong effect thì effect nhận
    //    `counts` làm phụ thuộc, ghi xong tự chạy lại, tạo object mới, ghi tiếp:
    //    vòng lặp vô hạn khoá cứng luồng chính, trang workspace đứng hình.
    //    Đọc hai signal của trang TRƯỚC untracked để chúng vẫn là phụ thuộc thật.
    effect(() => {
      if (!this.workspacesReady()) return;
      const workspaces = this.workspaces().length;
      const boards = this.totalBoardsCount();
      untracked(() => this.tour.observe({ workspaces, boards }));
    });

    // Hộp mời chỉ hiện SAU khi danh sách đã nạp xong. Hỏi lúc còn đang tải thì
    // nó chồng lên khung xương chờ, và nếu người dùng bấm "Show me around" ngay
    // thì `baseline` chốt nhầm số 0 trong khi thật ra họ đã có 5 workspace.
    effect(() => {
      if (!this.workspacesReady()) return;
      untracked(() => this.tour.maybeInvite());
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
    // Đang ở bước xác nhận xoá → Esc chỉ rút khỏi bước đó, giữ lại modal Edit
    // phía dưới cùng phần đang sửa dở. Và tuyệt nhiên không xoá gì cả.
    if (this.showDeleteWorkspaceModal()) {
      this.cancelWorkspaceDelete();
      return;
    }
    if (this.showDeleteOrgModal()) {
      this.cancelOrgDelete();
      return;
    }
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

    // ĐỔI TỔ CHỨC = quay về trạng thái đang tải, và DỌN danh sách cũ.
    //
    // Trước đây `workspacesReady` chỉ bật `true` một lần rồi ở nguyên đó, nên
    // đổi tổ chức là màn hình giữ nguyên workspace của tổ chức TRƯỚC cho tới
    // khi dữ liệu mới về — người dùng nhìn thấy dữ liệu không thuộc về nơi họ
    // vừa chuyển tới, tưởng là bấm nhầm hoặc app hỏng.
    //
    // Dọn `workspaces` chứ không chỉ hạ cờ: giữ lại thì có một nhịp mà cả
    // skeleton lẫn danh sách cũ đều biến mất/hiện lộn xộn.
    this.workspacesReady.set(false);
    this.workspaces.set([]);

    if (!userId || !orgId) {
      this.workspaces.set([]);
      // Vẫn coi là "nạp xong": không có tổ chức thì cũng không có gì để chờ nữa,
      // và nút "+ Tạo" phải phản hồi được thay vì im lặng.
      this.workspacesReady.set(true);
      return;
    }

    // Danh sách sao độc lập với workspace → gọi song song, không nối đuôi.
    await Promise.all([
      this.workspaceService.loadWorkspaces(orgId),
      this.boardPrefs.loadStars(),
    ]);
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
    const boardsPerWorkspace = await Promise.all(
      serverWorkspaces.map(async (w) => {
        await this.boardService.loadBoards(w.id);
        return this.boardService.boards();
      }),
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
    this.dongBoSao();
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

  readonly isCreatingOrg = signal(false);

  async createOrg(data: { name: string; slug: string }): Promise<void> {
    if (this.isCreatingOrg()) return;
    this.isCreatingOrg.set(true);
    try {
      const { org, error } = await this.orgService.createOrg(data.name, data.slug);
      if (!org) {
        this.addToast(error ?? 'Failed to create the organization, please try again!', 'error');
        return;
      }
      this.addToast(`Created organization "${org.name}" at /${org.slug}`, 'success');
      this.showOrgCreateModal.set(false);
      void this.router.navigate(['/', org.slug, 'workspace']);
    } finally {
      this.isCreatingOrg.set(false);
    }
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
    // Lời mời đã gửi chỉ nạp khi mở modal — nạp sẵn cho mọi tổ chức lúc đăng
    // nhập là phí request cho thứ hiếm khi ai xem.
    void this.orgService.loadPendingInvites(orgId);
    this.showOrgManageModal.set(true);
  }

  closeManageOrg(): void {
    this.showOrgManageModal.set(false);
    this.managingOrgId.set(null);
  }

  async inviteMember(data: { orgId: string; uuid: string; role: OrgInviteRole }): Promise<void> {
    const error = await this.orgService.inviteMember(data.orgId, data.uuid, data.role);
    const quyen = data.role === 'admin' ? 'admin' : 'member';
    this.orgManageModal()?.showResult(
      error,
      `Invite sent (joining as ${quyen})! Waiting for them to accept via the notification bell.`,
    );
    if (!error) this.addToast(`📨 Invite sent as ${quyen}!`, 'success');
  }

  async removeOrgMember(data: { orgId: string; userId: string }): Promise<void> {
    const member = this.managingOrgMembers().find((m) => m.user.id === data.userId);
    const name = member?.user.displayName ?? member?.user.email ?? 'member';
    const error = await this.orgService.removeMember(data.orgId, data.userId);
    this.orgManageModal()?.showResult(error, `Removed ${name} from the organization.`);
    if (!error) this.addToast(`Removed ${name} from the organization.`, 'info');
  }

  async changeOrgMemberRole(data: { orgId: string; userId: string; role: Role }): Promise<void> {
    const member = this.managingOrgMembers().find((m) => m.user.id === data.userId);
    const name = member?.user.displayName ?? member?.user.email ?? 'member';
    const quyen = data.role === 'admin' ? 'Admin' : 'Member';
    const error = await this.orgService.changeRole(data.orgId, data.userId, data.role);
    this.orgManageModal()?.showResult(error, `Changed ${name} to ${quyen}.`);
    if (!error) this.addToast(`Changed ${name}'s role to ${quyen}.`, 'success');
  }

  async cancelOrgInvite(inviteId: string): Promise<void> {
    const error = await this.orgService.cancelInvite(inviteId);
    this.orgManageModal()?.showResult(error, 'Invite canceled.');
  }

  async renameOrg(data: { orgId: string; name: string }): Promise<void> {
    const error = await this.orgService.updateOrg(data.orgId, { name: data.name });
    this.orgManageModal()?.showResult(error, 'Organization info updated.');
    if (!error) this.addToast(`Updated organization "${data.name}".`, 'success');
  }

  // ---- Xoá tổ chức (gõ lại đúng tên mới xoá được) ----

  readonly showDeleteOrgModal = signal(false);
  readonly orgPendingDelete = signal<Organization | null>(null);
  readonly deletingOrg = signal(false);
  readonly deleteOrgError = signal<string | null>(null);

  /**
   * Số workspace sẽ mất theo, để cảnh báo nói bằng con số thật.
   *
   * `workspaces()` chỉ chứa workspace của tổ chức ĐANG MỞ, nên với tổ chức khác
   * (mở Manage từ ô chuyển tổ chức) ta không biết con số. Trả `null` = "không
   * rõ" và để hộp thoại nói chung chung — thà không nêu số còn hơn nêu số sai
   * cho một thao tác không hoàn tác được.
   */
  readonly orgPendingDeleteWorkspaceCount = computed<number | null>(() => {
    const org = this.orgPendingDelete();
    if (!org) return null;
    return org.id === this.orgService.activeOrgId() ? this.workspaces().length : null;
  });

  /** Bước 1 — chỉ mở hộp thoại xác nhận. Chưa gọi API, chưa đụng gì tới dữ liệu. */
  requestOrgDelete(orgId: string): void {
    const org = this.organizations().find((o) => o.id === orgId);
    if (!org) return;
    this.orgPendingDelete.set(org);
    this.deleteOrgError.set(null);
    this.showDeleteOrgModal.set(true);
  }

  /** Huỷ (Cancel / X / nền / Esc) — tổ chức giữ nguyên, modal quản lý vẫn còn nguyên dữ liệu. */
  cancelOrgDelete(): void {
    // Đang gọi API dở thì không cho rút lui: đóng modal lúc này chỉ làm người
    // dùng tưởng đã huỷ được, trong khi request vẫn đang chạy tới server.
    if (this.deletingOrg()) return;
    this.showDeleteOrgModal.set(false);
    this.orgPendingDelete.set(null);
    this.deleteOrgError.set(null);
  }

  /** Bước 2 — người dùng đã gõ đúng tên tổ chức và bấm Delete. */
  async confirmOrgDelete(): Promise<void> {
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
        // Hỏng thì GIỮ modal mở kèm lỗi — đóng lại như thể đã xong là nói dối
        // người dùng: tổ chức vẫn còn đó và họ không biết để thử lại.
        this.deleteOrgError.set(error);
        return;
      }

      this.showDeleteOrgModal.set(false);
      this.orgPendingDelete.set(null);
      this.closeManageOrg();
      this.addToast(`Deleted organization "${org.name}".`, 'info');

      // `deleteOrg` đã reload xong, và store tự chọn lại tổ chức hợp lệ. Nhưng
      // slug của tổ chức vừa xoá vẫn nằm trên thanh địa chỉ, nên phải rời khỏi
      // URL đó — nếu không, F5 một cái là rơi vào trang không tồn tại.
      const slug = this.orgService.activeOrgSlug();
      void this.router.navigate(slug ? ['/', slug, 'workspace'] : ['/onboarding']);
    } finally {
      this.deletingOrg.set(false);
    }
  }

  copyMyUuid(): void {
    const uid = this.currentUser()?.id;
    if (!uid) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(uid);
      this.copiedMyUuid.set(true);
      this.addToast(`Copied your UUID: ${uid}`, 'success');
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
    this.addToast('Reloaded all sample Workspaces successfully!', 'success');
  }

  onBoardClick(board: BoardItem): void {
    void this.router.navigate(['/', this.orgService.activeOrgSlug(), 'board', board.id]);
  }

  /**
   * Gắn/bỏ sao — GỌI BACKEND (`/stars`), không còn nhét cờ vào localStorage.
   *
   * Trạng thái thật nằm ở `boardPrefs.starredBoardIds`; ở đây chỉ chép lại xuống
   * cờ `starred` của thẻ hiển thị để giao diện vẽ ngay.
   */
  async toggleStar(boardId: string): Promise<void> {
    await this.boardPrefs.toggleStar(boardId);
    this.dongBoSao();
  }

  /** Chép `starredBoardIds` xuống cờ `starred` của từng thẻ board đang hiển thị. */
  private dongBoSao(): void {
    const sao = this.boardPrefs.starredBoardIds();
    this.workspaces.update((list) =>
      list.map((ws) => ({
        ...ws,
        boards: ws.boards.map((b) => ({ ...b, starred: sao.has(b.id) })),
      })),
    );
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
    this.addToast(`Deleted board "${board.title}"`, 'info');
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
    this.addToast(`Saved changes to board "${title}"!`, 'success');
    const warning = this.boardService.storageWarning();
    if (warning) this.addToast(warning, 'error');
  }

  // ---- Board Modal Actions ----
  openCreateBoard(defaultWorkspaceId: string | null = null): void {
    if (this.workspaces().length === 0) {
      this.addToast('Create a Workspace before you can create a board.', 'info');
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
    this.addToast(`Creating board from template "${template.title}"`);
  }

  async handleBoardSubmit(data: {
    title: string;
    workspaceId: string;
    privacy: Privacy;
    background: BoardBackground;
    backgroundImageUrl?: string;
    selectedMemberIds: string[];
  }): Promise<void> {
    // Lượt trước còn đang chạy thì bỏ qua hẳn cú này. Đặt TRƯỚC mọi thứ khác:
    // chỉ cần lọt qua đây là đã có thêm một board thật trong database.
    if (this.creatingBoard()) return;
    this.creatingBoard.set(true);
    try {
      await this.taoBoard(data);
    } finally {
      // `finally` chứ không phải đặt lại ở cuối: hàm dưới có mấy đường thoát
      // sớm (không thấy workspace, backend trả về rỗng) và có thể ném lỗi.
      // Bỏ sót một đường là nút "Create board" khoá vĩnh viễn cho tới khi F5.
      this.creatingBoard.set(false);
    }
  }

  /** Phần việc thật của `handleBoardSubmit`, tách ra cho `try/finally` ở trên gọn. */
  private async taoBoard(data: {
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

    this.addToast(`Created new board "${newBoard.title}"!`, 'success');
    const warning = this.boardService.storageWarning();
    if (warning) this.addToast(warning, 'error');
    this.showCreateBoardModal.set(false);

    // ⚠️ Báo cho tour NGAY TẠI ĐÂY, đồng bộ, trước khi điều hướng.
    //
    // `effect()` ở constructor cũng báo số này, nhưng effect chạy bất đồng bộ.
    // Dòng dưới điều hướng sang trang board và huỷ component này — nếu điều
    // hướng kịp trước, effect không bao giờ chạy và số board mới KHÔNG được báo.
    // Tour đứng mãi ở bước "tạo board" trong khi người dùng đã đứng trong chính
    // cái board vừa tạo. Đây là cạnh tranh thời điểm nên nó chỉ hỏng lúc máy
    // nhanh hoặc mạng nhanh — kiểu lỗi tệ nhất để tìm.
    this.tour.observe({
      workspaces: this.workspaces().length,
      boards: this.totalBoardsCount(),
    });

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

  readonly isSavingWorkspace = signal<boolean>(false);

  async handleWorkspaceSave(data: {
    orgId?: string;
    name: string;
    description: string;
    visibility: WorkspaceVisibility;
    memberIds: string[];
    members: WorkspaceMember[];
  }): Promise<void> {
    if (this.isSavingWorkspace()) return;
    this.isSavingWorkspace.set(true);

    try {
      const { name, description, visibility, memberIds, members } = data;
      const orgId = data.orgId || this.orgService.activeOrgId();
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
        this.addToast(error ?? 'Failed to create the workspace.', 'error');
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
        description: description || 'A brand-new Workspace just got created.',
        boards: [],
      };

      if (orgId !== this.orgService.activeOrgId()) {
        this.orgService.switchOrg(orgId);
      } else {
        this.workspaces.update((list) => {
          const updated = [...list, newWs];
          this.persist(updated);
          return updated;
        });
        this.activeWorkspaceId.set(newWs.id);
      }
      this.addToast(`🎉 Created Workspace "${newWs.name}"!`, 'success');
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
      this.addToast(`Updated Workspace "${name}"`, 'success');
    }
    this.showWorkspaceModal.set(false);
    } finally {
      this.isSavingWorkspace.set(false);
    }
  }

  /** Bước 1 — chỉ mở hộp thoại xác nhận. Chưa gọi API, chưa đụng gì tới dữ liệu. */
  requestWorkspaceDelete(wsId: string): void {
    const ws = this.workspaces().find((w) => w.id === wsId);
    if (!ws) return;
    this.workspacePendingDelete.set(ws);
    this.deleteWorkspaceError.set(null);
    this.showDeleteWorkspaceModal.set(true);
  }

  /** Huỷ (Cancel / X / nền / Esc) — workspace giữ nguyên, modal Edit vẫn còn nguyên dữ liệu. */
  cancelWorkspaceDelete(): void {
    // Đang gọi API dở thì không cho rút lui: đóng modal lúc này chỉ làm người
    // dùng tưởng đã huỷ được, trong khi request vẫn đang chạy tới server.
    if (this.deletingWorkspace()) return;
    this.showDeleteWorkspaceModal.set(false);
    this.workspacePendingDelete.set(null);
    this.deleteWorkspaceError.set(null);
  }

  /** Bước 2 — người dùng đã gõ đúng tên workspace và bấm Delete. */
  async confirmWorkspaceDelete(): Promise<void> {
    // Chốt chặn cuối cho double-click: cú click thứ hai vào đây quay đầu ngay,
    // không bắn thêm một request xoá thứ hai.
    if (this.deletingWorkspace()) return;

    const ws = this.workspacePendingDelete();
    if (!ws) return;

    this.deletingWorkspace.set(true);
    this.deleteWorkspaceError.set(null);
    try {
      // Xoá trên server TRƯỚC. Xoá ở giao diện trước rồi server hỏng là danh sách
      // trên màn hình lệch với database cho tới lần F5 kế tiếp.
      const error = await this.workspaceService.deleteWorkspace(ws.id);
      if (error) {
        // Hỏng thì GIỮ modal mở kèm lỗi — đóng lại như thể đã xong là nói dối
        // người dùng: workspace vẫn còn đó và họ không biết để thử lại.
        this.deleteWorkspaceError.set(error);
        return;
      }

      this.workspaces.update((list) => {
        const updated = list.filter((w) => w.id !== ws.id);
        this.persist(updated);
        return updated;
      });
      if (this.activeWorkspaceId() === ws.id) {
        this.activeWorkspaceId.set(null);
      }
      this.showDeleteWorkspaceModal.set(false);
      this.workspacePendingDelete.set(null);
      this.showWorkspaceModal.set(false);
      this.addToast(`Deleted Workspace "${ws.name}"`, 'info');
    } finally {
      this.deletingWorkspace.set(false);
    }
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

