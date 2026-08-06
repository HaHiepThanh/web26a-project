import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LabelService, LABEL_COLOR_PALETTE } from '../../../services/label.service';

/** Chọn nhiều nhãn cùng lúc cho 1 thẻ + tự tạo nhãn mới (#5). Bảng màu tự tạo loại
 *  trừ đỏ/vàng/xám vì 3 màu đó đã khoá riêng cho mức ưu tiên (#4). */
@Component({
  selector: 'app-label-picker',
  imports: [FormsModule],
  templateUrl: './label-picker.html',
  styleUrl: './label-picker.css',
})
export class LabelPicker {
  private readonly labelService = inject(LabelService);

  readonly boardId = input.required<string>();
  readonly selectedIds = input<string[]>([]);
  readonly selectionChange = output<string[]>();

  readonly labels = this.labelService.labels;
  readonly palette = LABEL_COLOR_PALETTE;

  readonly showCreateForm = signal(false);
  readonly newName = signal('');
  readonly newColor = signal(LABEL_COLOR_PALETTE[0]);

  isSelected(labelId: string): boolean {
    return this.selectedIds().includes(labelId);
  }

  toggle(labelId: string): void {
    const current = this.selectedIds();
    const next = current.includes(labelId) ? current.filter((id) => id !== labelId) : [...current, labelId];
    this.selectionChange.emit(next);
  }

  openCreateForm(): void {
    this.newName.set('');
    this.newColor.set(LABEL_COLOR_PALETTE[0]);
    this.showCreateForm.set(true);
  }

  cancelCreateForm(): void {
    this.showCreateForm.set(false);
  }

  async submitCreateForm(): Promise<void> {
    const name = this.newName().trim();
    if (!name) return;
    const label = await this.labelService.createLabel(this.boardId(), name, this.newColor());
    if (label) this.selectionChange.emit([...this.selectedIds(), label.id]);
    this.showCreateForm.set(false);
  }
}
