import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiChecklistItem, ChecklistItem, ChecklistProgress } from '../models';
import { ApiService } from './api.service';
import { describeError } from './api-error.util';

/**
 * [BONUS #4] Checklist trong thẻ — GỌI BACKEND THẬT (`/checklist`).
 *
 * Trước đây dữ liệu chỉ nằm trong signal: gõ xong F5 một cái là mất sạch. Nay
 * mọi thao tác đi xuống bảng `checklist_items`.
 *
 * Tick/xoá dùng optimistic update: đổi trên màn hình NGAY rồi mới gọi API, hỏng
 * thì trả lại trạng thái cũ. Tick một ô mà phải chờ mạng mới thấy dấu check thì
 * cảm giác rất tệ.
 */
@Injectable({ providedIn: 'root' })
export class ChecklistService {
  private readonly api = inject(ApiService);

  readonly itemsByCard = signal<Record<string, ChecklistItem[]>>({});
  readonly lastError = signal<{ id: number; message: string } | null>(null);
  private errorSeq = 0;

  /** Thẻ đã nạp checklist rồi — tránh gọi lại mỗi lần mở lại cùng một thẻ. */
  private readonly loaded = new Set<string>();

  /** done/total theo từng card — dùng để hiện badge tiến độ ở mặt thẻ ngoài danh sách. */
  readonly progressByCard = computed(() => {
    const result: Record<string, ChecklistProgress | undefined> = {};
    for (const [cardId, items] of Object.entries(this.itemsByCard())) {
      if (!items.length) continue;
      result[cardId] = { done: items.filter((i) => i.isDone).length, total: items.length };
    }
    return result;
  });

  private fail(message: string): void {
    this.errorSeq++;
    this.lastError.set({ id: this.errorSeq, message });
  }

  private toItem(r: ApiChecklistItem): ChecklistItem {
    return {
      id: r.id,
      cardId: r.cardId,
      content: r.content,
      isDone: r.isDone,
      position: r.position,
    };
  }

  itemsFor(cardId: string): ChecklistItem[] {
    return [...(this.itemsByCard()[cardId] ?? [])].sort((a, b) => a.position - b.position);
  }

  /** Nạp checklist của 1 thẻ. Gọi khi mở modal chi tiết thẻ. */
  async loadChecklist(cardId: string, force = false): Promise<void> {
    if (!cardId) return;
    if (!force && this.loaded.has(cardId)) return;
    this.loaded.add(cardId);
    try {
      const rows = await this.api.get<ApiChecklistItem[]>(
        `/checklist?cardId=${encodeURIComponent(cardId)}`,
      );
      this.itemsByCard.update((map) => ({ ...map, [cardId]: rows.map((r) => this.toItem(r)) }));
    } catch (e) {
      this.loaded.delete(cardId); // cho phép thử lại lần sau
      this.fail(describeError(e, 'Failed to load checklist.'));
    }
  }

  async addItem(cardId: string, content: string): Promise<void> {
    const text = content.trim();
    if (!text) return;
    try {
      const row = await this.api.post<ApiChecklistItem>('/checklist', { cardId, content: text });
      this.applyRemoteItem(row);
    } catch (e) {
      this.fail(describeError(e, 'Failed to add checklist item.'));
    }
  }

  async toggleItem(cardId: string, itemId: string): Promise<void> {
    const previous = this.itemsByCard();
    const item = (previous[cardId] ?? []).find((i) => i.id === itemId);
    if (!item) return;
    const isDone = !item.isDone;

    this.itemsByCard.update((map) => ({
      ...map,
      [cardId]: (map[cardId] ?? []).map((i) => (i.id === itemId ? { ...i, isDone } : i)),
    }));

    try {
      await this.api.patch<ApiChecklistItem>(`/checklist/${itemId}`, { isDone });
    } catch (e) {
      this.itemsByCard.set(previous);
      this.fail(describeError(e, 'Failed to save checklist item status.'));
    }
  }

  async renameItem(cardId: string, itemId: string, content: string): Promise<void> {
    const text = content.trim();
    if (!text) return;
    const previous = this.itemsByCard();
    this.itemsByCard.update((map) => ({
      ...map,
      [cardId]: (map[cardId] ?? []).map((i) => (i.id === itemId ? { ...i, content: text } : i)),
    }));
    try {
      await this.api.patch<ApiChecklistItem>(`/checklist/${itemId}`, { content: text });
    } catch (e) {
      this.itemsByCard.set(previous);
      this.fail(describeError(e, 'Failed to update checklist item content.'));
    }
  }

  async deleteItem(cardId: string, itemId: string): Promise<void> {
    const previous = this.itemsByCard();
    this.itemsByCard.update((map) => ({
      ...map,
      [cardId]: (map[cardId] ?? []).filter((i) => i.id !== itemId),
    }));
    try {
      await this.api.delete(`/checklist/${itemId}`);
    } catch (e) {
      this.itemsByCard.set(previous);
      this.fail(describeError(e, 'Failed to delete checklist item.'));
    }
  }

  // ---- Nhận từ WebSocket (người khác sửa checklist trên cùng board) ----

  /** Upsert theo id — sự kiện có thể về TRƯỚC phản hồi HTTP của chính mình. */
  applyRemoteItem(r: ApiChecklistItem): void {
    const item = this.toItem(r);
    this.itemsByCard.update((map) => {
      const current = map[item.cardId];
      // Thẻ chưa mở thì bỏ qua: lần đầu mở sẽ `loadChecklist()` lấy đủ.
      if (!current) return map;
      const idx = current.findIndex((i) => i.id === item.id);
      const next = idx >= 0 ? current.map((i) => (i.id === item.id ? item : i)) : [...current, item];
      return { ...map, [item.cardId]: next.sort((a, b) => a.position - b.position) };
    });
  }

  applyRemoteDeleted(cardId: string, itemId: string): void {
    this.itemsByCard.update((map) => {
      const current = map[cardId];
      if (!current) return map;
      return { ...map, [cardId]: current.filter((i) => i.id !== itemId) };
    });
  }

  /** Dọn checklist của 1 card khỏi bộ nhớ (khi xoá card) — database tự cascade. */
  clearCard(cardId: string): void {
    this.loaded.delete(cardId);
    this.itemsByCard.update((map) => {
      const next = { ...map };
      delete next[cardId];
      return next;
    });
  }
}

// Kiểu đã chuyển sang models/ — re-export để chỗ nào còn import từ đây vẫn chạy.
export type { ChecklistProgress };
