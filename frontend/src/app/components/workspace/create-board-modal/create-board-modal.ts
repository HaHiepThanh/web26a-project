import { Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideBuilding2, LucideImage, LucideLock, LucideTriangleAlert, LucideX } from '@lucide/angular';
import { BOARD_BACKGROUNDS, BoardBackground } from '../../../models';
import { Privacy, WorkspaceItem, avatarBgFor, initialsOf } from '../../../mocks';

const MAX_BG_IMAGE_BYTES = 10 * 1024 * 1024; // Ảnh gốc tối đa 10MB (sẽ được nén lại bên dưới).
const MAX_BG_WIDTH = 1600; // Đủ nét làm nền full-HD, không cần to hơn.
const BG_JPEG_QUALITY = 0.82;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Thu nhỏ + nén ảnh về JPEG trước khi lưu. localStorage chỉ ~5MB mà 1 ảnh PNG
 *  800x600 đã ngốn ~620KB base64 — không nén thì vài board là vỡ quota. */
async function compressImage(file: File): Promise<string> {
  const originalUrl = await readAsDataUrl(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Không đọc được ảnh'));
    img.src = originalUrl;
  });

  const scale = Math.min(1, MAX_BG_WIDTH / img.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return originalUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const compressed = canvas.toDataURL('image/jpeg', BG_JPEG_QUALITY);
  // Ảnh nhỏ/đơn sắc đôi khi nén ra còn nặng hơn bản gốc — giữ bản nhẹ hơn.
  return compressed.length < originalUrl.length ? compressed : originalUrl;
}

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
