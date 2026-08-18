import { Component, input, output, signal } from '@angular/core';
import { LucidePin, LucideTag, LucideTrash2, LucideX } from '@lucide/angular';
import { Label, List } from '../../../models';

@Component({
  selector: 'app-board-bulk-actions',
  imports: [LucidePin, LucideTag, LucideTrash2, LucideX],
  templateUrl: './board-bulk-actions.html',
})
export class BoardBulkActions {
  readonly selectedCount = input<number>(0);
  readonly lists = input<List[]>([]);
  readonly labels = input<Label[]>([]);

  readonly moveToList = output<string>();
  readonly applyLabel = output<string>();
  readonly saveHighlight = output<void>();
  readonly deleteSelected = output<void>();
  readonly clearSelection = output<void>();

  readonly showBulkLabelPicker = signal(false);

  toggleBulkLabelPicker(): void {
    this.showBulkLabelPicker.update((v) => !v);
  }

  onMoveSelect(event: Event): void {
    const target = event.target as HTMLSelectElement;
    if (target.value) {
      this.moveToList.emit(target.value);
      target.value = '';
    }
  }

  onApplyLabel(labelId: string): void {
    this.applyLabel.emit(labelId);
    this.showBulkLabelPicker.set(false);
  }
}
