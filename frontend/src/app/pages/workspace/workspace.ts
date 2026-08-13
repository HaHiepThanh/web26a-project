import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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
}

function mockWorkspaces(): WorkspaceItem[] {
  return [
    {
      id: 'ws-1',
      name: 'Đồ án Tốt nghiệp CNTT',
      icon: '🎓',
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
  imports: [FormsModule],
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
    const all: (BoardItem & { workspaceName: string })[] = [];
    for (const ws of this.workspaces()) {
      for (const board of ws.boards) {
        if (board.starred) all.push({ ...board, workspaceName: ws.name });
      }
    }
    if (!q) return all;
    return all.filter((b) => b.title.toLowerCase().includes(q) || b.tag.toLowerCase().includes(q));
  });

  readonly filteredWorkspaces = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.workspaces();
    return this.workspaces().map((ws) => ({
      ...ws,
      boards: ws.boards.filter((b) => b.title.toLowerCase().includes(q) || b.tag.toLowerCase().includes(q)),
    }));
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

  addWorkspace(): void {
    const name = window.prompt('Nhập tên Workspace mới:');
    if (!name?.trim()) return;
    const newWs: WorkspaceItem = {
      id: 'ws-' + Date.now(),
      name: name.trim(),
      icon: '📂',
      membersCount: 1,
      description: 'Không gian làm việc mới vừa được khởi tạo.',
      boards: [],
    };
    this.workspaces.update((list) => [...list, newWs]);
    this.addToast(`Đã tạo Workspace mới: "${newWs.name}"`);
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
