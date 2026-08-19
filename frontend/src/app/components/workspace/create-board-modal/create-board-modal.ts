import { Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideBuilding2, LucideImage, LucideLock, LucideTriangleAlert, LucideX } from '@lucide/angular';
import { BOARD_BACKGROUNDS, BoardBackground } from '../../../models';
import { Privacy, WorkspaceItem, avatarBgFor, initialsOf } from '../../../mocks';
import { compressImage } from '../../../utils/image.util';

const MAX_BG_IMAGE_BYTES = 10 * 1024 * 1024; // Ảnh gốc tối đa 10MB (sẽ được nén lại bên dưới).

@Component({
  selector: 'app-create-board-modal',
  imports: [FormsModule, LucideBuilding2, LucideImage, LucideLock, LucideTriangleAlert, LucideX],
  templateUrl: './create-board-modal.html',
})
export class CreateBoardModal {
  readonly isOpen = input<boolean>(false);
  readonly workspaces = input<WorkspaceItem[]>([]);
  readonly initialWorkspaceId = input<string | null>(null);
  readonly initialTitle = input<string>('');

  readonly close = output<void>();
  readonly submitBoard = output<{
    title: string;
    workspaceId: string;
    privacy: Privacy;
    background: BoardBackground;
    backgroundImageUrl?: string;
    selectedMemberIds: string[];
  }>();

  readonly titleInput = signal('');
  readonly titleError = signal<string | null>(null);
  readonly workspaceIdInput = signal('');
  readonly privacyInput = signal<Privacy>('Workspace');
  readonly selectedMemberIds = signal<string[]>([]);
  readonly selectedBgClass = signal<BoardBackground>('bg-board-blue');
  readonly bgClasses = BOARD_BACKGROUNDS;
  readonly bgImageUrl = signal<string | null>(null);
  readonly bgImageError = signal<string | null>(null);

  readonly initialsOf = initialsOf;
  readonly avatarBgFor = avatarBgFor;

  readonly currentWorkspaceMembers = computed(() => {
    const wsId = this.workspaceIdInput();
    const ws = this.workspaces().find((w) => w.id === wsId);
    return ws?.members || [];
  });

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        const initWs = this.initialWorkspaceId();
        const firstWsId = this.workspaces()[0]?.id || '';
        const wsId = initWs && this.workspaces().some((w) => w.id === initWs) ? initWs : firstWsId;
        
        this.titleInput.set(this.initialTitle());
        this.titleError.set(null);
        this.workspaceIdInput.set(wsId);
        this.privacyInput.set('Workspace');
        this.selectedBgClass.set('bg-board-blue');
        this.bgImageUrl.set(null);
        this.bgImageError.set(null);

        const ws = this.workspaces().find((w) => w.id === wsId);
        this.selectedMemberIds.set(ws ? ws.members.map((m) => m.id) : []);
      }
    });
  }

  onWorkspaceChange(wsId: string): void {
    this.workspaceIdInput.set(wsId);
    const ws = this.workspaces().find((w) => w.id === wsId);
    this.selectedMemberIds.set(ws ? ws.members.map((m) => m.id) : []);
  }

  toggleMember(memberId: string): void {
    this.selectedMemberIds.update((ids) => {
      if (ids.includes(memberId)) {
        if (ids.length <= 1) return ids;
        return ids.filter((id) => id !== memberId);
      } else {
        return [...ids, memberId];
      }
    });
  }

  selectAllMembers(): void {
    const members = this.currentWorkspaceMembers();
    this.selectedMemberIds.set(members.map((m) => m.id));
  }

  deselectAllMembers(): void {
    const members = this.currentWorkspaceMembers();
    if (members.length > 0) {
      this.selectedMemberIds.set([members[0].id]);
    }
  }

  async onBgImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.bgImageError.set('Vui lòng chọn một tệp hình ảnh!');
      return;
    }
    if (file.size > MAX_BG_IMAGE_BYTES) {
      this.bgImageError.set('Ảnh quá lớn (tối đa 10MB)!');
      return;
    }

    this.bgImageError.set(null);
    try {
      this.bgImageUrl.set(await compressImage(file));
    } catch {
      this.bgImageError.set('Không đọc được ảnh này, thử ảnh khác nhé!');
    }
  }

  clearBgImage(): void {
    this.bgImageUrl.set(null);
    this.bgImageError.set(null);
  }

  onSubmit(): void {
    const title = this.titleInput().trim();
    if (!title) {
      this.titleError.set('Vui lòng nhập tên bảng dự án!');
      return;
    }
    this.titleError.set(null);

    this.submitBoard.emit({
      title,
      workspaceId: this.workspaceIdInput(),
      privacy: this.privacyInput(),
      background: this.selectedBgClass(),
      backgroundImageUrl: this.bgImageUrl() ?? undefined,
      selectedMemberIds: this.selectedMemberIds(),
    });
  }
}
