import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { WorkspaceUiService } from '../../services/workspace-ui.service';

type Privacy = 'Workspace' | 'Private' | 'Public';
type BgClass = 'bg-board-blue' | 'bg-board-purple' | 'bg-board-green' | 'bg-board-teal' | 'bg-board-orange';
type ToastType = 'success' | 'error' | 'info';

interface BoardItem {
  id: string;
  title: string;
  tag: string;
  privacy: Privacy;
  badge: string;
  starred: boolean;
  bgClass: BgClass;
}

interface WorkspaceItem {
  id: string;
  name: string;
  icon: string;
  iconBg: BgClass;
  membersCount: number;
  description: string;
  boards: BoardItem[];
}

interface Template {
  title: string;
  desc: string;
  badge: string;
  badgeClass: string;
  columns: number;
}

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  action?: { label: string; handler: () => void };
}

interface TrashedBoard {
  board: BoardItem;
  workspaceId: string;
  workspaceName: string;
  originalIndex: number;
}

function mockWorkspaces(): WorkspaceItem[] {
  return [
    {
      id: 'ws-1',
      name: 'Đồ án Tốt nghiệp CNTT',
      icon: '🎓',
      iconBg: 'bg-board-blue',
      membersCount: 4,
      description: 'Workspace quản lý toàn bộ các công việc nghiên cứu và phát triển phần mềm đồ án tốt nghiệp khóa K22.',
      boards: [
        { id: 'b-1', title: 'Hệ thống Quản lý Kanban', tag: 'ĐỒ ÁN TỐT NGHIỆP CNTT', privacy: 'Workspace', badge: 'KANBAN', starred: true, bgClass: 'bg-board-blue' },
        { id: 'b-2', title: 'Ứng dụng tìm trọ thông minh', tag: 'ĐỒ ÁN TỐT NGHIỆP CNTT', privacy: 'Private', badge: 'KANBAN', starred: false, bgClass: 'bg-board-green' },
        { id: 'b-3', title: 'Kế hoạch Tuần cá nhân', tag: 'ĐỒ ÁN TỐT NGHIỆP CNTT', privacy: 'Workspace', badge: 'KANBAN', starred: false, bgClass: 'bg-board-teal' },
      ],
    },
    {
      id: 'ws-2',
      name: 'Dự án Khởi nghiệp SaaS',
      icon: '🚀',
      iconBg: 'bg-board-purple',
      membersCount: 2,
      description: 'Không gian làm việc cho dự án SaaS khởi nghiệp sinh viên.',
      boards: [
        { id: 'b-4', title: 'Sản phẩm MVP v1.0', tag: 'DỰ ÁN KHỞI NGHIỆP SAAS', privacy: 'Public', badge: 'KANBAN', starred: true, bgClass: 'bg-board-purple' },
      ],
    },
  ];
}

const TEMPLATES: Template[] = [
  { title: 'Quản lý Dự án Agile', desc: 'Quy trình chuẩn Backlog, Doing, Review, Done cho phần mềm.', badge: '1', badgeClass: 'badge-blue', columns: 4 },
  { title: 'Kế hoạch Tuần cá nhân', desc: 'Quản lý các đầu việc từ Thứ 2 đến Chủ nhật.', badge: '2', badgeClass: 'badge-green', columns: 5 },
  { title: 'Phát hành Marketing Campaign', desc: 'Lên ý tưởng, thiết kế asset và quảng bá sản phẩm.', badge: '3', badgeClass: 'badge-orange', columns: 4 },
];

const BG_CLASSES: BgClass[] = ['bg-board-blue', 'bg-board-purple', 'bg-board-green', 'bg-board-teal', 'bg-board-orange'];

/** Bảng grid + workspace dashboard (ported từ trello-workspace prototype). */
@Component({
  selector: 'app-workspace',
  imports: [FormsModule, RouterLink],
  templateUrl: './workspace.html',
  styleUrl: './workspace.css',
})
export class Workspace {
  private readonly workspaceUi = inject(WorkspaceUiService);
  private readonly router = inject(Router);

  readonly workspaces = signal<WorkspaceItem[]>(mockWorkspaces());
  readonly activeWorkspaceId = signal('ws-1');
  readonly templates = TEMPLATES;
  readonly bgClasses = BG_CLASSES;

  readonly searchQuery = this.workspaceUi.searchQuery;

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
    const members = list.reduce((sum, ws) => sum + ws.membersCount, 0);
    return { boards, members, starred };
  });

  readonly filteredWorkspaces = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.workspaces();
    return this.workspaces().map((ws) => ({
      ...ws,
      boards: ws.boards.filter((b) => b.title.toLowerCase().includes(q) || b.tag.toLowerCase().includes(q)),
    }));
  });

  /** Đang gõ tìm kiếm nhưng không khớp board nào ở workspace nào cả. */
  readonly searchHasNoResults = computed(() => {
    if (!this.searchQuery().trim()) return false;
    return this.filteredWorkspaces().every((ws) => ws.boards.length === 0);
  });

  selectWorkspace(id: string): void {
    this.activeWorkspaceId.set(id);
    const ws = this.workspaces().find((w) => w.id === id);
    if (ws) this.addToast(`Đã chọn Workspace: ${ws.name}`);
  }

  toggleStar(boardId: string): void {
    let title = '';
    let starred = false;
    this.workspaces.update((list) =>
      list.map((ws) => ({
        ...ws,
        boards: ws.boards.map((b) => {
          if (b.id !== boardId) return b;
          starred = !b.starred;
          title = b.title;
          return { ...b, starred };
        }),
      })),
    );
    if (title) this.addToast(starred ? `Đã đánh dấu sao bảng "${title}"` : `Đã bỏ đánh dấu sao bảng "${title}"`);
  }

  onBoardClick(board: BoardItem): void {
    this.addToast(`Đang mở bảng: ${board.title}`);
    void this.router.navigate(['/board', board.id]);
  }

  // ---- Xóa bảng lẻ → chuyển vào Thùng rác (không xóa cả workspace) ----
  readonly trash = signal<TrashedBoard[]>([]);
  /**
   * Key của tile đang hiện popover xác nhận "Xóa bảng này?" (chỉ 1 popover mở tại 1 thời điểm).
   * Dùng key ghép `scopeId:boardId` thay vì chỉ `boardId` — vì 1 bảng đã đánh dấu sao sẽ render
   * ở CẢ khu "Đánh dấu sao" lẫn khu workspace gốc của nó cùng lúc; nếu chỉ khoá theo boardId thì
   * bấm xóa ở 1 chỗ sẽ vô tình bật popover ở cả 2 chỗ (2 tile khác nhau nhưng cùng board.id).
   */
  readonly confirmDeleteKey = signal<string | null>(null);

  /** Xác nhận xong (từ popover) mới thật sự xóa. Vẫn cho hoàn tác nhanh qua toast, đồng thời lưu vào Thùng rác để khôi phục về sau — chỉ mất hẳn khi người dùng tự xóa vĩnh viễn trong Thùng rác. */
  deleteBoard(workspaceId: string, board: BoardItem): void {
    this.confirmDeleteKey.set(null);

    let removedIndex = -1;
    let workspaceName = '';
    this.workspaces.update((list) =>
      list.map((ws) => {
        if (ws.id !== workspaceId) return ws;
        workspaceName = ws.name;
        removedIndex = ws.boards.findIndex((b) => b.id === board.id);
        return { ...ws, boards: ws.boards.filter((b) => b.id !== board.id) };
      }),
    );

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

    this.workspaces.update((list) =>
      list.map((ws) => {
        if (ws.id !== entry.workspaceId) return ws;
        const boards = [...ws.boards];
        const insertAt = Math.max(0, Math.min(entry.originalIndex, boards.length));
        boards.splice(insertAt, 0, entry.board);
        return { ...ws, boards };
      }),
    );
    this.trash.update((list) => list.filter((t) => t.board.id !== boardId));
    this.addToast(`Đã khôi phục bảng "${entry.board.title}"`);
  }

  // ---- Modal Thùng rác ----
  readonly showTrashModal = signal(false);
  readonly trashPermanentConfirmId = signal<string | null>(null);

  openTrashModal(): void {
    this.trashPermanentConfirmId.set(null);
    this.showTrashModal.set(true);
  }

  closeTrashModal(): void {
    this.showTrashModal.set(false);
    this.trashPermanentConfirmId.set(null);
  }

  /** Xóa vĩnh viễn cũng cần bấm 2 lần — đây là hành động không thể hoàn tác. */
  permanentlyDeleteFromTrash(boardId: string): void {
    if (this.trashPermanentConfirmId() !== boardId) {
      this.trashPermanentConfirmId.set(boardId);
      return;
    }
    const entry = this.trash().find((t) => t.board.id === boardId);
    this.trash.update((list) => list.filter((t) => t.board.id !== boardId));
    this.trashPermanentConfirmId.set(null);
    if (entry) this.addToast(`Đã xóa vĩnh viễn bảng "${entry.board.title}"`);
  }

  // ---- Create board modal ----
  readonly showCreateModal = signal(false);
  readonly newBoardTitle = signal('');
  readonly newBoardWorkspaceId = signal('ws-1');
  readonly newBoardPrivacy = signal<Privacy>('Workspace');
  readonly selectedBgClass = signal<BgClass>('bg-board-blue');

  openCreateModal(defaultWorkspaceId = 'ws-1'): void {
    this.newBoardTitle.set('');
    this.newBoardWorkspaceId.set(this.workspaces().some((w) => w.id === defaultWorkspaceId) ? defaultWorkspaceId : (this.workspaces()[0]?.id ?? ''));
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

  onCreateBoardSubmit(): void {
    const title = this.newBoardTitle().trim();
    const wsId = this.newBoardWorkspaceId();
    if (!title) return;

    const targetWorkspace = this.workspaces().find((w) => w.id === wsId);
    if (!targetWorkspace) return;

    const newBoard: BoardItem = {
      id: 'b-' + Date.now(),
      title,
      tag: targetWorkspace.name.toUpperCase(),
      privacy: this.newBoardPrivacy(),
      badge: 'KANBAN',
      starred: false,
      bgClass: this.selectedBgClass(),
    };

    this.workspaces.update((list) => list.map((ws) => (ws.id === wsId ? { ...ws, boards: [...ws.boards, newBoard] } : ws)));
    this.addToast(`Đã tạo bảng mới "${newBoard.title}"!`);
    this.closeCreateModal();
  }

  // ---- Create/edit/delete Workspace modal ----
  readonly showWorkspaceModal = signal(false);
  readonly workspaceModalMode = signal<'create' | 'edit'>('create');
  readonly editingWorkspaceId = signal<string | null>(null);
  readonly workspaceNameInput = signal('');
  readonly workspaceIconInput = signal('📂');
  readonly workspaceDescInput = signal('');
  readonly deleteConfirmArmed = signal(false);
  readonly quickIcons = ['📂', '🎯', '🚀', '🎓', '💡', '📊', '🛠️', '🎨'];

  openCreateWorkspaceModal(): void {
    this.workspaceModalMode.set('create');
    this.editingWorkspaceId.set(null);
    this.workspaceNameInput.set('');
    this.workspaceIconInput.set('📂');
    this.workspaceDescInput.set('');
    this.deleteConfirmArmed.set(false);
    this.showWorkspaceModal.set(true);
  }

  openEditWorkspaceModal(ws: WorkspaceItem): void {
    this.workspaceModalMode.set('edit');
    this.editingWorkspaceId.set(ws.id);
    this.workspaceNameInput.set(ws.name);
    this.workspaceIconInput.set(ws.icon);
    this.workspaceDescInput.set(ws.description);
    this.deleteConfirmArmed.set(false);
    this.showWorkspaceModal.set(true);
  }

  closeWorkspaceModal(): void {
    this.showWorkspaceModal.set(false);
    this.deleteConfirmArmed.set(false);
  }

  onWorkspaceModalSubmit(): void {
    const name = this.workspaceNameInput().trim();
    if (!name) return;
    const icon = this.workspaceIconInput().trim() || '📂';
    const description = this.workspaceDescInput().trim();

    if (this.workspaceModalMode() === 'create') {
      const newWs: WorkspaceItem = {
        id: 'ws-' + Date.now(),
        name,
        icon,
        iconBg: BG_CLASSES[this.workspaces().length % BG_CLASSES.length],
        membersCount: 1,
        description: description || 'Không gian làm việc mới vừa được khởi tạo.',
        boards: [],
      };
      this.workspaces.update((list) => [...list, newWs]);
      this.activeWorkspaceId.set(newWs.id);
      this.addToast(`Đã tạo Workspace mới: "${newWs.name}"`);
    } else {
      const id = this.editingWorkspaceId();
      this.workspaces.update((list) => list.map((ws) => (ws.id === id ? { ...ws, name, icon, description } : ws)));
      this.addToast(`Đã cập nhật Workspace "${name}"`);
    }
    this.closeWorkspaceModal();
  }

  /** Xóa cần bấm 2 lần liên tiếp (nút đổi sang trạng thái "Bấm lần nữa để xác nhận") — tránh xóa nhầm mà không cần popup confirm() thô của trình duyệt. */
  confirmDeleteWorkspace(): void {
    if (!this.deleteConfirmArmed()) {
      this.deleteConfirmArmed.set(true);
      return;
    }
    const id = this.editingWorkspaceId();
    if (!id) return;
    const list = this.workspaces();
    if (list.length <= 1) {
      this.addToast('Không thể xóa Workspace cuối cùng.', 'error');
      return;
    }
    const removed = list.find((w) => w.id === id);
    const remaining = list.filter((w) => w.id !== id);
    this.workspaces.set(remaining);
    if (this.activeWorkspaceId() === id) {
      this.activeWorkspaceId.set(remaining[0].id);
    }
    this.addToast(removed ? `Đã xóa Workspace "${removed.name}"` : 'Đã xóa Workspace');
    this.closeWorkspaceModal();
  }

  // ---- Header "+ Tạo" button (via WorkspaceUiService) opens the modal too ----
  private lastCreateRequestSeen = 0;
  private readonly openOnHeaderRequest = effect(() => {
    const n = this.workspaceUi.createBoardRequests();
    if (n > this.lastCreateRequestSeen) {
      this.lastCreateRequestSeen = n;
      if (n > 0) this.openCreateModal(this.activeWorkspaceId());
    }
  });

  // ---- Keyboard shortcuts: '/' focus search (handled by Header), 'N' new board, Esc close modal ----
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeCreateModal();
      this.closeWorkspaceModal();
      this.closeTrashModal();
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
