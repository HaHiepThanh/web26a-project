import { Component, input, output } from '@angular/core';
import { LucideTriangleAlert, LucideX } from '@lucide/angular';
import { List } from '../../../models';

@Component({
  selector: 'app-list-delete-modal',
  imports: [LucideTriangleAlert, LucideX],
  templateUrl: './list-delete-modal.html',
})
export class ListDeleteModal {
  readonly isOpen = input<boolean>(false);
  readonly list = input<List | null>(null);
  readonly cardsCount = input<number>(0);
  readonly deleting = input<boolean>(false);

  readonly cancel = output<void>();
  readonly confirm = output<List>();

  onBackdropClick(): void {
    if (!this.deleting()) {
      this.cancel.emit();
    }
  }

  onConfirm(): void {
    const l = this.list();
    if (l && !this.deleting()) {
      this.confirm.emit(l);
    }
  }
}
