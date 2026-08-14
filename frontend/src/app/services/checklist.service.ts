import { Injectable, computed, signal } from '@angular/core';
import { ChecklistItem } from '../models';

let idSeq = 1;
function mockId(prefix: string): string {
  return `${prefix}-${Date.now()}-${idSeq++}`;
}

export interface ChecklistProgress {
  done: number;
  total: number;
}

/** [BONUS #4] Checklist nhỏ trong card: thêm/tick/xoá item. Dữ liệu mock tại chỗ
 *  (chưa nối backend thật) — cùng phong cách với CardService/ListService: mutate
 *  signal ngay, không cần optimistic rollback vì thao tác không qua "lưu ngầm". */
@Injectable({ providedIn: 'root' })
export class ChecklistService {
  readonly itemsByCard = signal<Record<string, ChecklistItem[]>>({});

  /** done/total theo từng card — dùng để hiện badge tiến độ ở mặt thẻ ngoài danh sách. */
  readonly progressByCard = computed(() => {
    const result: Record<string, ChecklistProgress | undefined> = {};
    for (const [cardId, items] of Object.entries(this.itemsByCard())) {
      if (!items.length) continue;
      result[cardId] = { done: items.filter((i) => i.isDone).length, total: items.length };
    }
    return result;
  });

  itemsFor(cardId: string): ChecklistItem[] {
    return this.itemsByCard()[cardId] ?? [];
  }

  addItem(cardId: string, content: string): void {
    const text = content.trim();
    if (!text) return;
    const item: ChecklistItem = { id: mockId('checklist'), cardId, content: text, isDone: false, position: this.itemsFor(cardId).length };
    this.itemsByCard.update((map) => ({ ...map, [cardId]: [...(map[cardId] ?? []), item] }));
  }

  toggleItem(cardId: string, itemId: string): void {
    this.itemsByCard.update((map) => ({
      ...map,
      [cardId]: (map[cardId] ?? []).map((i) => (i.id === itemId ? { ...i, isDone: !i.isDone } : i)),
    }));
  }

  deleteItem(cardId: string, itemId: string): void {
    this.itemsByCard.update((map) => ({ ...map, [cardId]: (map[cardId] ?? []).filter((i) => i.id !== itemId) }));
  }

  /** Xoá toàn bộ checklist của 1 card (khi xoá card). */
  clearCard(cardId: string): void {
    this.itemsByCard.update((map) => {
      const next = { ...map };
      delete next[cardId];
      return next;
    });
  }
}
