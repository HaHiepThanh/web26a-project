import { computed, Signal } from '@angular/core';
import { ChatTaskSuggestion } from '../../models';

/** Hàm generic thuần — xem chú thích trong `ngrx/list/list.computed.ts`. */
export function taskSuggestionComputed(store: { entities: Signal<ChatTaskSuggestion[]>; openedId: Signal<string | null> }) {
  return {
    opened: computed(() => store.entities().find((s) => s.id === store.openedId()) ?? null),
    /** Tra theo messageId — khung chat vẽ chip ngay dưới đúng tin nhắn đó
     *  (`message-list.html` dùng đúng cấu trúc này, xem mục 5 của tài liệu). */
    byMessageId: computed(() => {
      const map: Record<string, ChatTaskSuggestion | undefined> = {};
      for (const s of store.entities()) if (s.status === 'pending') map[s.messageId] = s;
      return map;
    }),
  };
}
