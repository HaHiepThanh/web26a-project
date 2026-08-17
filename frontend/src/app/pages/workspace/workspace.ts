import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { WorkspaceUiService } from '../../services/workspace-ui.service';
import { BoardService } from '../../services/board.service';
import { AuthService } from '../../services/auth.service';
import { BoardBackground, BoardVisibility, User } from '../../models';
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
import { WorkspaceSidebar } from '../../components/workspace/workspace-sidebar/workspace-sidebar';
import { WorkspaceWelcomeBanner } from '../../components/workspace/workspace-welcome-banner/workspace-welcome-banner';
import { WorkspaceCardItem } from '../../components/workspace/workspace-card-item/workspace-card-item';
import { CreateBoardModal } from '../../components/workspace/create-board-modal/create-board-modal';
import { WorkspaceFormModal } from '../../components/workspace/workspace-form-modal/workspace-form-modal';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
  action?: { label: string; handler: () => void };
}

function toBoardVisibility(privacy: Privacy): BoardVisibility {
  return privacy === 'Public' ? 'public' : 'restricted';
}

@Component({
  selector: 'app-workspace',
  imports: [
    WorkspaceSidebar,
    WorkspaceWelcomeBanner,
    WorkspaceCardItem,
    CreateBoardModal,
    WorkspaceFormModal,
  ],
  templateUrl: './workspace.html',
  styleUrl: './workspace.css',
})
export class Workspace {
  private readonly workspaceUi = inject(WorkspaceUiService);
  private readonly boardService = inject(BoardService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly currentUser = this.auth.currentUser;
  readonly copiedMyUuid = signal(false);

  readonly workspaces = signal<WorkspaceItem[]>(loadStoredWorkspaces());
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

  // Computed views
  readonly totalBoardsCount = computed(() => {
    return this.workspaces().reduce((sum, ws) => sum + ws.boards.length, 0);
  });

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
    effect(() => {
      const boardTrigger = this.workspaceUi.createBoardRequests();
      if (boardTrigger > 0) {
        this.openCreateBoard();
      }
    });

    effect(() => {
      const wsTrigger = this.workspaceUi.createWorkspaceRequests();
      if (wsTrigger > 0) {
        this.openCreateWorkspace();
      }
    });
  }

  @HostListener('window:keydown.escape')
  onEsc(): void {
    this.closeAllModals();
  }

  closeAllModals(): void {
    this.showCreateBoardModal.set(false);
    this.showWorkspaceModal.set(false);
    this.confirmDeleteKey.set(null);
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
    persistWorkspaces(samples);
    this.activeWorkspaceId.set(null);
    this.addToast('Đã tải lại toàn bộ Workspace mẫu thành công!', 'success');
  }

  onBoardClick(board: BoardItem): void {
    void this.router.navigate(['/board', board.id]);
  }

  toggleStar(boardId: string): void {
    this.workspaces.update((list) => {
      const updated = list.map((ws) => ({
        ...ws,
        boards: ws.boards.map((b) => (b.id === boardId ? { ...b, starred: !b.starred } : b)),
      }));
      persistWorkspaces(updated);
      return updated;
    });
  }

  deleteBoard(payload: { workspaceId: string; board: BoardItem }): void {
    const { workspaceId, board } = payload;
    this.workspaces.update((list) => {
      const updated = list.map((ws) =>
        ws.id === workspaceId ? { ...ws, boards: ws.boards.filter((b) => b.id !== board.id) } : ws,
      );
      persistWorkspaces(updated);
      return updated;
    });
    this.addToast(`Đã xóa bảng "${board.title}"`, 'info');
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
    selectedMemberIds: string[];
  }): Promise<void> {
    const { title, workspaceId, privacy, background } = data;
    const targetWorkspace = this.workspaces().find((w) => w.id === workspaceId);
    if (!targetWorkspace) return;

    const board = await this.boardService.createBoard(workspaceId, title, {
      visibility: toBoardVisibility(privacy),
      background,
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
      persistWorkspaces(updated);
      return updated;
    });

    this.addToast(`Đã tạo bảng mới "${newBoard.title}"!`, 'success');
    this.showCreateBoardModal.set(false);
    void this.router.navigate(['/board', board.id]);
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

  handleWorkspaceSave(data: {
    name: string;
    icon: string;
    iconBg: BoardBackground;
    description: string;
    members: WorkspaceMember[];
  }): void {
    const { name, icon, iconBg, description, members } = data;

    if (this.workspaceModalMode() === 'create') {
      const newWs: WorkspaceItem = {
        id: 'ws-' + Date.now(),
        name,
        icon,
        iconBg,
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
      this.addToast(`🎉 Đã tạo Không gian làm việc "${newWs.name}"!`, 'success');
    } else {
      const editingWs = this.selectedWorkspaceForEdit();
      if (!editingWs) return;

      this.workspaces.update((list) => {
        const updated = list.map((ws) =>
          ws.id === editingWs.id
            ? { ...ws, name, icon, iconBg, description, members, membersCount: members.length }
            : ws,
        );
        persistWorkspaces(updated);
        return updated;
      });
      this.addToast(`Đã cập nhật Workspace "${name}"`, 'success');
    }
    this.showWorkspaceModal.set(false);
  }

  handleWorkspaceDelete(wsId: string): void {
    const ws = this.workspaces().find((w) => w.id === wsId);
    this.workspaces.update((list) => {
      const updated = list.filter((w) => w.id !== wsId);
      persistWorkspaces(updated);
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
