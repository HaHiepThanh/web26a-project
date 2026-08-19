import { Component, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideImage, LucideTriangleAlert, LucideX } from '@lucide/angular';
import { BOARD_BACKGROUNDS, BoardBackground } from '../../../models';
import { BoardItem } from '../../../mocks';
import { compressImage } from '../../../utils/image.util';

const MAX_BG_IMAGE_BYTES = 10 * 1024 * 1024; // Ảnh gốc tối đa 10MB (sẽ được nén lại bên dưới).

/** Sửa nhanh 1 board đã tạo — chỉ tên + nền (màu/ảnh). Không đụng workspace/quyền
 *  riêng tư/thành viên: BoardItem không lưu selectedMemberIds nên sửa quyền riêng tư
 *  ở đây rất dễ làm mất danh sách thành viên đã chọn lúc tạo. */
@Component({
  selector: 'app-board-edit-modal',
  imports: [FormsModule, LucideImage, LucideTriangleAlert, LucideX],
  templateUrl: './board-edit-modal.html',
})
export class BoardEditModal {
  readonly isOpen = input<boolean>(false);
  readonly board = input<BoardItem | null>(null);
  readonly currentBgImageUrl = input<string | undefined>(undefined);

  readonly close = output<void>();
  readonly save = output<{
    boardId: string;
    title: string;
    background: BoardBackground;
    backgroundImageUrl?: string;
  }>();

  readonly titleInput = signal('');
  readonly titleError = signal<string | null>(null);
  readonly selectedBgClass = signal<BoardBackground>('bg-board-blue');
  readonly bgClasses = BOARD_BACKGROUNDS;
  readonly bgImageUrl = signal<string | null>(null);
  readonly bgImageError = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        const b = this.board();
        this.titleInput.set(b?.title ?? '');
        this.titleError.set(null);
        this.selectedBgClass.set(b?.bgClass ?? 'bg-board-blue');
        this.bgImageUrl.set(this.currentBgImageUrl() ?? null);
        this.bgImageError.set(null);
      }
    });
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
    const board = this.board();
    if (!board) return;
    const title = this.titleInput().trim();
    if (!title) {
      this.titleError.set('Vui lòng nhập tên bảng dự án!');
      return;
    }
    this.titleError.set(null);

    this.save.emit({
      boardId: board.id,
      title,
      background: this.selectedBgClass(),
      backgroundImageUrl: this.bgImageUrl() ?? undefined,
    });
  }
}
