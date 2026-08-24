import { computed, inject, Signal } from '@angular/core';
import { Message } from '../../models';
import { AuthService } from '../../services/auth.service';
import { groupBy } from '../shared/entity.util';

/** Hàm generic thuần — xem chú thích trong `ngrx/list/list.computed.ts`. */
export function chatComputed(store: {
  entities: Signal<Message[]>;
  loadedBoardId: Signal<string | null>;
  lastSeenAt: Signal<Record<string, number>>;
}) {
  const auth = inject(AuthService);

  /** Tin của board đang mở, cũ→mới. KHÔNG dựa vào thứ tự chèn (mục "Bẫy #2"):
   *  tin nạp theo trang / preview xen kẽ có thể về không đúng thứ tự. */
  const messages = computed(() => {
    const id = store.loadedBoardId();
    if (!id) return [];
    return store
      .entities()
      .filter((m) => m.boardId === id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  });

  const byBoard = computed(() => groupBy(store.entities(), (m) => m.boardId));

  /** Tổng số tin chưa đọc trên mọi board — Header dùng để chấm badge 💬. */
  const totalUnread = computed(() => {
    const me = auth.currentUserId();
    const seen = store.lastSeenAt();
    let total = 0;
    for (const [boardId, msgs] of byBoard()) {
      const mark = seen[boardId] ?? 0;
      total += msgs.filter((m) => m.userId !== me && Date.parse(m.createdAt) > mark).length;
    }
    return total;
  });

  return { messages, byBoard, totalUnread, currentUserId: auth.currentUserId };
}
