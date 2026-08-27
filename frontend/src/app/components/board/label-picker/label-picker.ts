import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LabelStore } from '../../../ngrx/label/label.store';
import { LABEL_COLOR_PALETTE } from '../../../ngrx/label/label.state';
import { Label } from '../../../models';

/** Chọn nhiều nhãn cùng lúc cho 1 thẻ + tự tạo & sửa & xoá nhãn mới (#5). */
@Component({
  selector: 'app-label-picker',
  imports: [FormsModule],
  templateUrl: './label-picker.html',
  styleUrl: './label-picker.css',
})
export class LabelPicker {
  private readonly labelService = inject(LabelStore);

  readonly boardId = input.required<string>();
  readonly selectedIds = input<string[]>([]);
  readonly selectionChange = output<string[]>();

  readonly labels = this.labelService.labels;
  readonly palette = LABEL_COLOR_PALETTE;

  readonly showCreateForm = signal(false);
  readonly editingLabelId = signal<string | null>(null);
  readonly newName = signal('');
  readonly newColor = signal(LABEL_COLOR_PALETTE[0]);

  /** Palette cố định + kiểm tra trùng màu. */
  readonly isDuplicateColor = computed(() => {
    const currentColor = this.newColor();
    const editId = this.editingLabelId();
    return this.labels().some((l) => l.color.toLowerCase() === currentColor.toLowerCase() && l.id !== editId);
  });

  isSelected(labelId: string): boolean {
    return this.selectedIds().includes(labelId);
  }

  toggle(labelId: string): void {
    const current = this.selectedIds();
    const next = current.includes(labelId) ? current.filter((id) => id !== labelId) : [...current, labelId];
    this.selectionChange.emit(next);
  }

  openCreateForm(): void {
    this.editingLabelId.set(null);
    this.newName.set('');
    this.newColor.set(LABEL_COLOR_PALETTE[0]);
    this.showCreateForm.set(true);
  }

  startEditLabel(lb: Label, event: Event): void {
    event.stopPropagation();
    this.editingLabelId.set(lb.id);
    this.newName.set(lb.name);
    this.newColor.set(lb.color);
    this.showCreateForm.set(true);
  }

  cancelCreateForm(): void {
    this.showCreateForm.set(false);
    this.editingLabelId.set(null);
  }

  onCustomColorInput(color: string): void {
    this.newColor.set(color);
  }

  async submitCreateForm(): Promise<void> {
    const name = this.newName().trim().slice(0, 15);
    if (!name) return;
    const editId = this.editingLabelId();

    if (editId) {
      await this.labelService.updateLabel(editId, name, this.newColor());
    } else {
      const label = await this.labelService.createLabel(this.boardId(), name, this.newColor());
      if (label) this.selectionChange.emit([...this.selectedIds(), label.id]);
    }

    this.showCreateForm.set(false);
    this.editingLabelId.set(null);
  }

  async deleteLabel(id: string, event: Event): Promise<void> {
    event.stopPropagation();
    await this.labelService.deleteLabel(id);
    this.selectionChange.emit(this.selectedIds().filter((labelId) => labelId !== id));
    if (this.editingLabelId() === id) {
      this.cancelCreateForm();
    }
  }
}
