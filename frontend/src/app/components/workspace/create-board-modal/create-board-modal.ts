import { Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideBuilding2, LucideImage, LucideLock, LucideTriangleAlert, LucideX } from '@lucide/angular';
import { BOARD_BACKGROUNDS, BoardBackground } from '../../../models';
import { Privacy, WorkspaceItem } from '../../../mocks';
import { compressImage } from '../../../utils/image.util';
import { UserAvatar } from '../../shared/user-avatar/user-avatar';

const MAX_BG_IMAGE_BYTES = 10 * 1024 * 1024; // Ảnh gốc tối đa 10MB (sẽ được nén lại bên dưới).

@Component({
  selector: 'app-create-board-modal',
  imports: [FormsModule, LucideBuilding2, LucideImage, LucideLock, LucideTriangleAlert, LucideX, UserAvatar],
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

  /**
   * VÙNG CHỌN thành viên cho board — lấy từ workspace đang chọn, KHÔNG phải từ
   * tổ chức.
   *
   * Tổ chức 10 người mà workspace chỉ mở cho 5 thì ở đây chỉ được xổ ra 5. Danh
   * sách này do backend quyết định (`WorkspaceItem.members` dựng từ
   * `GET /workspaces` + roster tổ chức), frontend không tự gom.
   */
  readonly currentWorkspaceMembers = computed(() => {
    const wsId = this.workspaceIdInput();
    const ws = this.workspaces().find((w) => w.id === wsId);
    return ws?.members || [];
  });

  readonly memberSearch = signal('');

  /** Lọc tại chỗ theo tên / email / id — danh sách đã nằm sẵn trong bộ nhớ. */
  readonly filteredMembers = computed(() => {
    const q = this.memberSearch().trim().toLowerCase();
    const all = this.currentWorkspaceMembers();
    if (!q) return all;
    return all.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.displayName ?? '').toLowerCase().includes(q),
    );
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
        this.memberSearch.set('');

        const ws = this.workspaces().find((w) => w.id === wsId);
        this.selectedMemberIds.set(ws ? ws.members.map((m) => m.id) : []);
      }
    });
  }

  onWorkspaceChange(wsId: string): void {
    this.workspaceIdInput.set(wsId);
    this.memberSearch.set('');
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
      this.bgImageError.set('Please choose an image file!');
      return;
    }
    if (file.size > MAX_BG_IMAGE_BYTES) {
      this.bgImageError.set('Image is too large (max 10MB)!');
      return;
    }

    this.bgImageError.set(null);
    try {
      this.bgImageUrl.set(await compressImage(file));
    } catch {
      this.bgImageError.set("Couldn't read this image, please try another one!");
    }
  }

  clearBgImage(): void {
    this.bgImageUrl.set(null);
    this.bgImageError.set(null);
  }

  onSubmit(): void {
    const title = this.titleInput().trim();
    if (!title) {
      this.titleError.set('Please enter a board name!');
      return;
    }
    if (title.length > 50) {
      this.titleError.set('Board name must be at most 50 characters!');
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
