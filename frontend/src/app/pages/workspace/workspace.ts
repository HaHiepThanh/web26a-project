import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WorkspaceUiService } from '../../services/workspace-ui.service';
import { BoardService } from '../../services/board.service';
import { AuthService } from '../../services/auth.service';
import { BOARD_BACKGROUNDS, BoardBackground, BoardVisibility, User, MOCK_SEARCHABLE_USERS } from '../../models';
import {
  WorkspaceItem,
  WorkspaceMember,
  BoardItem,
  TrashedBoard,
  Template,
  Toast,
  ToastType,
  Privacy,
  initialMockWorkspaces,
  loadStoredWorkspaces,
  persistWorkspaces,
  WORKSPACE_TEMPLATES,
  initialsOf,
  avatarBgFor,
} from '../../mocks';

/** Privacy (nhãn hiển thị tiếng Việt ở modal) → BoardVisibility thật của model Board. */
function toBoardVisibility(privacy: Privacy): BoardVisibility {
  return privacy === 'Public' ? 'public' : 'restricted';
}


/** Bảng grid + workspace dashboard (ported từ trello-workspace prototype). */
@Component({
  selector: 'app-workspace',
  imports: [FormsModule],
  templateUrl: './workspace.html',
  styleUrl: './workspace.css',
})
export class Workspace {
  private readonly workspaceUi = inject(WorkspaceUiService);
  private readonly boardService = inject(BoardService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly initialsOf = initialsOf;
  readonly avatarBgFor = avatarBgFor;
  readonly mockSearchableUsers = MOCK_SEARCHABLE_USERS;
  readonly currentUser = this.auth.currentUser;
  readonly copiedMyUuid = signal(false);

  readonly workspaces = signal<WorkspaceItem[]>(loadStoredWorkspaces());
  /** activeWorkspaceId: null nghĩa là hiển thị tất cả, hoặc string id để lọc riêng workspace đó */
  readonly activeWorkspaceId = signal<string | null>(null);
  readonly templates = WORKSPACE_TEMPLATES;
  readonly bgClasses = BOARD_BACKGROUNDS;

  readonly searchQuery = this.workspaceUi.searchQuery;

  readonly totalBoardsCount = computed(() => {
    return this.workspaces().reduce((sum, ws) => sum + ws.boards.length, 0);
  });

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

  loadSampleWorkspaces(): void {
    const samples = initialMockWorkspaces();
    this.workspaces.set(samples);
    persistWorkspaces(samples);
    this.activeWorkspaceId.set(null);
    this.addToast('🎉 Đã tải Không gian làm việc mẫu thành công!', 'success');
  }


  readonly starredBoards = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const all: (BoardItem & { workspaceName: string; workspaceId: string })[] = [];
    for (const ws of this.workspaces()) {
      for (const board of ws.boards) {
        if (board.starred) all.push({ ...board, workspaceName: ws.name, workspaceId: ws.id });
      }
    }
    if (!q) return all;
    return all.filter((b) => b.title.toLowerCase().includes(q) || b.tag.toLowerCase().includes(q));
  });

  /** Số liệu nhanh hiển thị trong hero banner — luôn tính trên toàn bộ dữ liệu, không bị lọc theo ô tìm kiếm. */
  readonly heroStats = computed(() => {
    const list = this.workspaces();
    let boards = 0;
    let starred = 0;
    for (const ws of list) {
      for (const board of ws.boards) {
        boards++;
        if (board.starred) starred++;
      }
    }
    const members = list.reduce((sum, ws) => sum + (ws.members?.length || ws.membersCount || 0), 0);
    return { boards, members, starred };
  });

  readonly filteredWorkspaces = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const filterId = this.activeWorkspaceId();
    let list = this.workspaces();

    if (filterId) {
      list = list.filter((ws) => ws.id === filterId);
    }

    if (!q) return list;
    return list.map((ws) => ({
      ...ws,
      boards: ws.boards.filter((b) => b.title.toLowerCase().includes(q) || b.tag.toLowerCase().includes(q)),
    }));
  });

  /** Đang gõ tìm kiếm nhưng không khớp board nào ở workspace nào cả. */
  readonly searchHasNoResults = computed(() => {
    if (!this.searchQuery().trim()) return false;
    return this.filteredWorkspaces().every((ws) => ws.boards.length === 0);
  });

  selectWorkspace(id: string | null): void {
    if (this.activeWorkspaceId() === id && id !== null) {
      // Bấm lần 2 vào workspace đang chọn thì bỏ lọc (hiện lại tất cả)
      this.activeWorkspaceId.set(null);
      this.addToast('Đang hiển thị tất cả Không gian làm việc', 'info');
      return;
    }
    this.activeWorkspaceId.set(id);
    if (id === null) {
      this.addToast('Đang hiển thị tất cả Không gian làm việc', 'info');
    } else {
      const ws = this.workspaces().find((w) => w.id === id);
      if (ws) this.addToast(`Đang lọc Không gian làm việc: "${ws.name}"`, 'info');
    }
  }


  toggleStar(boardId: string): void {
    let title = '';
    let starred = false;
    this.workspaces.update((list) => {
      const updated = list.map((ws) => ({
        ...ws,
        boards: ws.boards.map((b) => {
          if (b.id !== boardId) return b;
          starred = !b.starred;
          title = b.title;
          return { ...b, starred };
        }),
      }));
      persistWorkspaces(updated);
      return updated;
    });
    if (title) this.addToast(starred ? `Đã đánh dấu sao bảng "${title}"` : `Đã bỏ đánh dấu sao bảng "${title}"`);
  }

  onBoardClick(board: BoardItem): void {
    this.addToast(`Đang mở bảng: ${board.title}`);
    void this.router.navigate(['/board', board.id]);
  }

  // ---- Xóa bảng lẻ → chuyển vào Thùng rác (không xóa cả workspace) ----
  readonly trash = signal<TrashedBoard[]>([]);
  readonly confirmDeleteKey = signal<string | null>(null);

  /** Xác nhận xong (từ popover) mới thật sự xóa. Vẫn cho hoàn tác nhanh qua toast, đồng thời lưu vào Thùng rác để khôi phục về sau — chỉ mất hẳn khi người dùng tự xóa vĩnh viễn trong Thùng rác. */
  deleteBoard(workspaceId: string, board: BoardItem): void {
    this.confirmDeleteKey.set(null);

    let removedIndex = -1;
    let workspaceName = '';
    this.workspaces.update((list) => {
      const updated = list.map((ws) => {
        if (ws.id !== workspaceId) return ws;
        workspaceName = ws.name;
        removedIndex = ws.boards.findIndex((b) => b.id === board.id);
        return { ...ws, boards: ws.boards.filter((b) => b.id !== board.id) };
      });
      persistWorkspaces(updated);
      return updated;
    });

    this.trash.update((list) => [{ board, workspaceId, workspaceName, originalIndex: removedIndex }, ...list]);

    const id = ++this.toastSeq;
    const dismiss = () => this.toasts.update((list) => list.filter((t) => t.id !== id));
    this.toasts.update((list) => [
      ...list,
      {
        id,
        message: `Đã xóa bảng "${board.title}"`,
        type: 'info',
        action: {
          label: 'Hoàn tác',
          handler: () => {
            this.restoreFromTrash(board.id);
            dismiss();
          },
        },
      },
    ]);
    setTimeout(dismiss, 4500);
  }

  restoreFromTrash(boardId: string): void {
    const entry = this.trash().find((t) => t.board.id === boardId);
    if (!entry) return;

    const workspaceStillExists = this.workspaces().some((ws) => ws.id === entry.workspaceId);
    if (!workspaceStillExists) {
      this.addToast('Workspace gốc của bảng này đã bị xóa, không thể khôi phục.', 'error');
      return;
    }

    this.workspaces.update((list) => {
      const updated = list.map((ws) => {
        if (ws.id !== entry.workspaceId) return ws;
        const boards = [...ws.boards];
        const insertAt = Math.max(0, Math.min(entry.originalIndex, boards.length));
        boards.splice(insertAt, 0, entry.board);
        return { ...ws, boards };
      });
      persistWorkspaces(updated);
      return updated;
    });
    this.trash.update((list) => list.filter((t) => t.board.id !== boardId));
    this.addToast(`Đã khôi phục bảng "${entry.board.title}"`);
  }

  // ---- Create board modal ----
  readonly showCreateModal = signal(false);
  readonly newBoardTitle = signal('');
  readonly newBoardWorkspaceId = signal('ws-1');
  readonly newBoardPrivacy = signal<Privacy>('Workspace');
  readonly selectedBgClass = signal<BoardBackground>('bg-board-blue');


  openCreateModal(defaultWorkspaceId: string | null = null): void {
    if (this.workspaces().length === 0) {
      this.addToast('Bạn cần tạo Workspace trước khi tạo bảng.', 'info');
      this.openCreateWorkspaceModal();
      return;
    }
    this.newBoardTitle.set('');
    this.newBoardWorkspaceId.set(defaultWorkspaceId && this.workspaces().some((w) => w.id === defaultWorkspaceId) ? defaultWorkspaceId : this.workspaces()[0].id);
    this.newBoardPrivacy.set('Workspace');
    this.selectedBgClass.set('bg-board-blue');
    this.showCreateModal.set(true);
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
  }

  useTemplate(template: Template): void {
    this.openCreateModal();
    this.newBoardTitle.set(template.title);
    this.addToast(`Đang tạo bảng từ mẫu "${template.title}"`);
  }

  async onCreateBoardSubmit(): Promise<void> {
    const title = this.newBoardTitle().trim();
    const wsId = this.newBoardWorkspaceId();
    if (!title) return;

    const targetWorkspace = this.workspaces().find((w) => w.id === wsId);
    if (!targetWorkspace) return;

    const background = this.selectedBgClass();
    const board = await this.boardService.createBoard(wsId, title, { visibility: toBoardVisibility(this.newBoardPrivacy()), background });
    if (!board) return;

    const newBoard: BoardItem = {
      id: board.id,
      title,
      tag: targetWorkspace.name.toUpperCase(),
      privacy: this.newBoardPrivacy(),
      badge: 'KANBAN',
      starred: false,
      bgClass: background,
    };

    this.workspaces.update((list) => {
      const updated = list.map((ws) => (ws.id === wsId ? { ...ws, boards: [...ws.boards, newBoard] } : ws));
      persistWorkspaces(updated);
      return updated;
    });
    this.addToast(`Đã tạo bảng mới "${newBoard.title}"!`);
    this.closeCreateModal();
    void this.router.navigate(['/board', board.id]);
  }


  // ---- Create/edit/delete Workspace modal & Member management ----
  readonly showWorkspaceModal = signal(false);
  readonly workspaceModalMode = signal<'create' | 'edit'>('create');
  readonly editingWorkspaceId = signal<string | null>(null);
  readonly workspaceNameInput = signal('');
  readonly workspaceIconInput = signal('📂');
  readonly workspaceIconBgInput = signal<BoardBackground>('bg-board-blue');
  readonly workspaceDescInput = signal('');
  readonly deleteConfirmArmed = signal(false);

  readonly iconCategories = [
    {
      name: '💼 Dự án',
      icons: ['📂', '📁', '🚀', '🎯', '⚡', '🔥', '📊', '📈', '🏢', '🏗️', '📋', '💼', '📌', '🏷️'],
    },
    {
      name: '💻 Công nghệ',
      icons: ['💻', '⚙️', '🛠️', '🤖', '🔒', '🌐', '🎮', '📱', '🕹️', '🧪', '🧬', '🖥️', '⌨️', '🛰️'],
    },
    {
      name: '🎓 Học tập',
      icons: ['🎓', '📚', '✏️', '📖', '💡', '🧠', '🔬', '📝', '🏫', '📐', '🏅', '🏆', '🎨', '🖌️'],
    },
    {
      name: '✨ Sáng tạo',
      icons: ['✨', '💎', '🌟', '☕', '🍀', '🌈', '🍕', '🎉', '✈️', '🎵', '❤️', '🏖️', '🌍', '⛺'],
    },
  ];
  readonly selectedIconCategory = signal<number>(0);

  // Member management inside Workspace modal
  readonly workspaceMembers = signal<WorkspaceMember[]>([]);
  readonly uuidSearchInput = signal('');
  readonly searchDropdownOpen = signal(false);

  /** Search users by UUID, Name, or Email */
  readonly searchResults = computed(() => {
    const q = this.uuidSearchInput().trim().toLowerCase();
    if (!q) return [];
    const all = this.auth.getSearchableUsers();
    const currentMemberIds = new Set(this.workspaceMembers().map((m) => m.id.toLowerCase()));
    return all.filter(
      (u) =>
        !currentMemberIds.has(u.id.toLowerCase()) &&
        (u.id.toLowerCase().includes(q) ||
          (u.displayName && u.displayName.toLowerCase().includes(q)) ||
          u.email.toLowerCase().includes(q)),
    );
  });

  openCreateWorkspaceModal(): void {
    this.workspaceModalMode.set('create');
    this.editingWorkspaceId.set(null);
    this.workspaceNameInput.set('');
    this.workspaceIconInput.set('📂');
    this.workspaceIconBgInput.set('bg-board-blue');
    this.workspaceDescInput.set('');
    this.deleteConfirmArmed.set(false);
    this.uuidSearchInput.set('');
    this.searchDropdownOpen.set(false);
    this.selectedIconCategory.set(0);

    // Creator is added as Owner
    const cur = this.auth.currentUser();
    const owner: WorkspaceMember = cur
      ? {
          id: cur.id,
          displayName: cur.displayName || cur.email.split('@')[0] || 'Bạn',
          email: cur.email,
          role: 'owner',
        }
      : {
          id: '8f4c2e10-9b3a-4e2a-871d-5b3a1a2e3f40',
          displayName: 'Nguyễn Văn Nam',
          email: 'nam.nguyen@trello.dev',
          role: 'owner',
        };
    this.workspaceMembers.set([owner]);
    this.showWorkspaceModal.set(true);
  }

  openEditWorkspaceModal(ws: WorkspaceItem): void {
    this.workspaceModalMode.set('edit');
    this.editingWorkspaceId.set(ws.id);
    this.workspaceNameInput.set(ws.name);
    this.workspaceIconInput.set(ws.icon);
    this.workspaceIconBgInput.set(ws.iconBg || 'bg-board-blue');
    this.workspaceDescInput.set(ws.description);
    this.deleteConfirmArmed.set(false);
    this.uuidSearchInput.set('');
    this.searchDropdownOpen.set(false);
    this.selectedIconCategory.set(0);
    this.workspaceMembers.set([...(ws.members || [])]);
    this.showWorkspaceModal.set(true);
  }


  closeWorkspaceModal(): void {
    this.showWorkspaceModal.set(false);
    this.deleteConfirmArmed.set(false);
    this.searchDropdownOpen.set(false);
  }

  addMember(user: User): void {
    const members = this.workspaceMembers();
    if (members.some((m) => m.id.toLowerCase() === user.id.toLowerCase())) {
      this.addToast('Thành viên này đã có trong danh sách.', 'info');
      return;
    }
    const newMember: WorkspaceMember = {
      id: user.id,
      displayName: user.displayName || user.email.split('@')[0],
      email: user.email,
      role: 'member',
      avatarUrl: user.avatarUrl,
    };
    this.workspaceMembers.update((list) => [...list, newMember]);
    this.uuidSearchInput.set('');
    this.searchDropdownOpen.set(false);
    this.addToast(`Đã thêm thành viên "${newMember.displayName}" (UUID: ${newMember.id.slice(0, 8)}...)`, 'success');
  }

  addMemberByInput(): void {
    const input = this.uuidSearchInput().trim();
    if (!input) return;

    // Check if matching any known user
    const found = this.auth.findUserByUuid(input) ?? this.auth.getSearchableUsers().find(
      (u) => u.email.toLowerCase() === input.toLowerCase() || (u.displayName && u.displayName.toLowerCase() === input.toLowerCase()),
    );

    if (found) {
      this.addMember(found);
      return;
    }

    // Direct UUID addition
    const members = this.workspaceMembers();
    if (members.some((m) => m.id.toLowerCase() === input.toLowerCase())) {
      this.addToast('Thành viên với UUID này đã có trong danh sách.', 'info');
      return;
    }

    const shortId = input.length > 8 ? input.slice(0, 8) : input;
    const isEmail = input.includes('@');
    const newMember: WorkspaceMember = {
      id: input,
      displayName: isEmail ? input.split('@')[0] : `Thành viên (${shortId})`,
      email: isEmail ? input : `${shortId}@trello.dev`,
      role: 'member',
    };
    this.workspaceMembers.update((list) => [...list, newMember]);
    this.uuidSearchInput.set('');
    this.searchDropdownOpen.set(false);
    this.addToast(`Đã thêm thành viên theo UUID: ${shortId}...`, 'success');
  }

  removeMember(memberId: string): void {
    const member = this.workspaceMembers().find((m) => m.id === memberId);
    if (member?.role === 'owner') {
      this.addToast('Không thể gỡ Trưởng nhóm (Owner) khỏi Workspace.', 'error');
      return;
    }
    this.workspaceMembers.update((list) => list.filter((m) => m.id !== memberId));
    if (member) this.addToast(`Đã gỡ thành viên "${member.displayName}"`, 'info');
  }

  copyMemberUuid(uuid: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(uuid);
      this.addToast(`Đã sao chép UUID: ${uuid}`, 'success');
    }
  }

  onWorkspaceModalSubmit(): void {
    const name = this.workspaceNameInput().trim();
    if (!name) {
      this.addToast('Vui lòng nhập tên Không gian làm việc!', 'error');
      return;
    }
    const icon = this.workspaceIconInput().trim() || '📂';
    const description = this.workspaceDescInput().trim();
    const members = this.workspaceMembers();

    if (this.workspaceModalMode() === 'create') {
      const newWs: WorkspaceItem = {
        id: 'ws-' + Date.now(),
        name,
        icon,
        iconBg: this.workspaceIconBgInput(),
        membersCount: members.length,
        members,
        description: description || 'Không gian làm việc mới vừa được khởi tạo.',
        boards: [],
      };
      this.workspaces.update((list) => {
        const updated = [...list, newWs];
        persistWorkspaces(updated);
        return updated;
      });
      this.activeWorkspaceId.set(newWs.id);
      this.addToast(`🎉 Đã tạo Không gian làm việc "${newWs.name}" với ${members.length} thành viên!`, 'success');
    } else {
      const id = this.editingWorkspaceId();
      this.workspaces.update((list) => {
        const updated = list.map((ws) =>
          ws.id === id
            ? { ...ws, name, icon, iconBg: this.workspaceIconBgInput(), description, members, membersCount: members.length }
            : ws,
        );
        persistWorkspaces(updated);
        return updated;
      });
      this.addToast(`Đã cập nhật Workspace "${name}"`, 'success');
    }
    this.closeWorkspaceModal();
  }

  /** Xóa cần bấm 2 lần liên tiếp */
  confirmDeleteWorkspace(): void {
    if (!this.deleteConfirmArmed()) {
      this.deleteConfirmArmed.set(true);
      return;
    }
    const id = this.editingWorkspaceId();
    if (!id) return;
    const list = this.workspaces();
    const removed = list.find((w) => w.id === id);
    const remaining = list.filter((w) => w.id !== id);
    this.workspaces.set(remaining);
    persistWorkspaces(remaining);
    if (this.activeWorkspaceId() === id) {
      this.activeWorkspaceId.set(remaining[0]?.id ?? null);
    }
    this.addToast(removed ? `Đã xóa Workspace "${removed.name}"` : 'Đã xóa Workspace');
    this.closeWorkspaceModal();
  }

  // ---- Header "+ Tạo" button & dropdown (via WorkspaceUiService) opens the modals ----
  private lastCreateBoardRequestSeen = 0;
  private readonly openOnHeaderBoardRequest = effect(() => {
    const n = this.workspaceUi.createBoardRequests();
    if (n > this.lastCreateBoardRequestSeen) {
      this.lastCreateBoardRequestSeen = n;
      if (n > 0) this.openCreateModal(this.activeWorkspaceId());
    }
  });

  private lastCreateWorkspaceRequestSeen = 0;
  private readonly openOnHeaderWorkspaceRequest = effect(() => {
    const n = this.workspaceUi.createWorkspaceRequests();
    if (n > this.lastCreateWorkspaceRequestSeen) {
      this.lastCreateWorkspaceRequestSeen = n;
      if (n > 0) this.openCreateWorkspaceModal();
    }
  });

  // ---- Keyboard shortcuts ----
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeCreateModal();
      this.closeWorkspaceModal();
      this.confirmDeleteKey.set(null);
      return;
    }

    const target = event.target as HTMLElement;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

    if (event.key === 'n' || event.key === 'N') {
      event.preventDefault();
      this.openCreateModal(this.activeWorkspaceId());
    }
  }

  // ---- Toasts ----
  private toastSeq = 0;
  readonly toasts = signal<Toast[]>([]);

  private addToast(message: string, type: ToastType = 'info'): void {
    const id = ++this.toastSeq;
    this.toasts.update((list) => [...list, { id, message, type }]);
    setTimeout(() => {
      this.toasts.update((list) => list.filter((t) => t.id !== id));
    }, 2500);
  }

  trackByWorkspaceId = (_: number, item: WorkspaceItem) => item.id;
  trackByBoardId = (_: number, item: BoardItem) => item.id;
}

