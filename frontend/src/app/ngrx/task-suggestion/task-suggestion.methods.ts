import { inject, Signal } from '@angular/core';
import { patchState, WritableStateSource } from '@ngrx/signals';
import { EntityState, removeEntities, removeEntity, upsertEntities, upsertEntity } from '@ngrx/signals/entities';
import { ChatTaskSuggestion, SuggestedCard } from '../../models';
import { ApiService } from '../../services/api.service';
import { describeError } from '../../services/api-error.util';
import { TaskSuggestionOwnState } from './task-suggestion.state';

type Store = WritableStateSource<EntityState<ChatTaskSuggestion> & TaskSuggestionOwnState> & {
  entities: Signal<ChatTaskSuggestion[]>;
  openedId: Signal<string | null>;
  fail: (message: string) => void;
};

/** Hàm generic thuần — xem chú thích trong `ngrx/list/list.computed.ts` (và
 *  `ngrx/list/list.methods.ts` về việc `inject(ApiService)` chỉ gọi một lần ở đây). */
export function taskSuggestionMethods<S extends Store>(store: S, api = inject(ApiService)) {
  return {
    suggestionsFor(boardId: string): ChatTaskSuggestion[] {
      return store.entities().filter((s) => s.boardId === boardId);
    },

    async loadSuggestions(boardId: string): Promise<void> {
      if (!boardId) return;
      try {
        const rows = await api.get<ChatTaskSuggestion[]>(`/task-suggestions?boardId=${encodeURIComponent(boardId)}`);
        patchState(store, removeEntities((s: ChatTaskSuggestion) => s.boardId === boardId), upsertEntities(rows));
      } catch {
        // Không báo lỗi ồn ào: mất gợi ý chỉ làm thiếu một tiện ích.
        patchState(store, removeEntities((s: ChatTaskSuggestion) => s.boardId === boardId));
      }
    },

    open(suggestion: ChatTaskSuggestion): void {
      patchState(store, { openedId: suggestion.id });
    },

    close(): void {
      patchState(store, { openedId: null });
    },

    /**
     * Chấp nhận → tạo thẻ thật. Trả về `null` khi thành công, hoặc câu lỗi.
     * Hai người cùng bấm thì người thứ hai nhận 409 — server chặn.
     */
    async accept(suggestion: ChatTaskSuggestion, cards: SuggestedCard[]): Promise<string | null> {
      try {
        await api.post(`/task-suggestions/${suggestion.id}/accept`, { cards });
        patchState(store, removeEntity(suggestion.id), { openedId: null });
        return null;
      } catch (e) {
        // Gợi ý đã bị người khác xử lý → gỡ khỏi màn hình luôn, giữ lại chỉ gây rối.
        patchState(store, removeEntity(suggestion.id), { openedId: null });
        return describeError(e, 'Could not create cards from the suggestion.');
      }
    },

    async dismiss(suggestion: ChatTaskSuggestion): Promise<void> {
      patchState(store, removeEntity(suggestion.id), { openedId: null });
      try {
        await api.post(`/task-suggestions/${suggestion.id}/dismiss`, {});
      } catch (e) {
        store.fail(describeError(e, 'Could not dismiss the suggestion.'));
      }
    },

    // ---- Nhận từ WebSocket ----

    /** Upsert — sự kiện có thể về TRƯỚC phản hồi HTTP của chính mình. */
    applyRemoteCreated(s: ChatTaskSuggestion): void {
      patchState(store, upsertEntity(s));
    },

    /** Ai đó đã chấp nhận/bỏ qua ở máy khác → gỡ chip ở đây luôn, kể cả khi
     *  người này đang mở modal của đúng gợi ý đó. */
    applyRemoteResolved(id: string): void {
      patchState(store, removeEntity(id));
      if (store.openedId() === id) patchState(store, { openedId: null });
    },
  };
}
