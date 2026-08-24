import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { ChecklistStore } from '../../../ngrx/checklist/checklist.store';
import { ActivityStore } from '../../../ngrx/activity/activity.store';

/** [BONUS #4] Checklist nhỏ trong card: thêm/tick/xoá item, thanh tiến độ. */
@Component({
  selector: 'app-checklist',
  imports: [],
  templateUrl: './checklist.html',
  styleUrl: './checklist.css',
})
export class Checklist {
  private readonly checklistService = inject(ChecklistStore);
  private readonly activityService = inject(ActivityStore);

  readonly cardId = input.required<string>();
  readonly boardId = input.required<string>();

  readonly items = computed(() => this.checklistService.itemsFor(this.cardId()));
  readonly progress = computed(() => {
    const list = this.items();
    const done = list.filter((i) => i.isDone).length;
    const total = list.length;
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  });

  readonly newItemText = signal('');

  constructor() {
    // Nạp checklist từ server mỗi khi mở một thẻ khác. Thiếu chỗ này thì thẻ cũ
    // luôn hiện rỗng — mục chỉ xuất hiện với thẻ vừa gõ trong phiên này.
    effect(() => {
      const id = this.cardId();
      if (id) void this.checklistService.loadChecklist(id);
    });
  }

  onInput(event: Event): void {
    this.newItemText.set((event.target as HTMLInputElement).value);
  }

  addItem(): void {
    const text = this.newItemText().trim();
    if (!text) return;
    void this.checklistService.addItem(this.cardId(), text);
    this.activityService.record(this.boardId(), this.cardId(), `added checklist item "${text}"`);
    this.newItemText.set('');
  }

  toggleItem(itemId: string): void {
    void this.checklistService.toggleItem(this.cardId(), itemId);
  }

  deleteItem(itemId: string): void {
    const item = this.items().find((i) => i.id === itemId);
    void this.checklistService.deleteItem(this.cardId(), itemId);
    if (item) this.activityService.record(this.boardId(), this.cardId(), `deleted checklist item "${item.content}"`);
  }
}
