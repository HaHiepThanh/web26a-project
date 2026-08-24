import { inject, Signal } from '@angular/core';
import { signalStoreFeature, withMethods, patchState, type } from '@ngrx/signals';
import { EntityState, EntityProps, upsertEntity, removeEntity, removeEntities, upsertEntities } from '@ngrx/signals/entities';
import { ApiChecklistItem, ChecklistItem } from '../../models';
import { ApiService } from '../../services/api.service';
import { describeError } from '../../services/api-error.util';
import { toItem } from './checklist.mapper';
import { ChecklistExtraState } from './checklist.state';
import { withId, withoutId } from '../shared/entity.util';

interface ChecklistMethodsProps extends EntityProps<ChecklistItem> {
  itemsByCard: Signal<Record<string, ChecklistItem[]>>;
}

/**
 * Checklist trong thẻ — GỌI BACKEND THẬT (`/checklist`).
 *
 * Tick/xoá/đổi tên dùng optimistic update: đổi trên màn hình NGAY rồi mới gọi
 * API, hỏng thì trả lại ĐÚNG MỤC đó — không `set()` lại cả checklist, tránh xoá
 * mất thay đổi của người khác đến qua WebSocket giữa lúc chờ API.
 */
export function withChecklistMethods() {
  return signalStoreFeature(
    {
      state: type<EntityState<ChecklistItem> & ChecklistExtraState>(),
      props: type<ChecklistMethodsProps>(),
      methods: type<{ fail(message: string): void }>(),
    },
    withMethods((store, api = inject(ApiService)) => ({
      itemsFor(cardId: string): ChecklistItem[] {
        return store.itemsByCard()[cardId] ?? [];
      },

      /** Nạp checklist của 1 thẻ. Gọi khi mở modal chi tiết thẻ. */
      async loadChecklist(cardId: string, force = false): Promise<void> {
        if (!cardId) return;
        if (!force && store.loadedCardIds().has(cardId)) return;
        patchState(store, { loadedCardIds: withId(store.loadedCardIds(), cardId) });
        try {
          const rows = await api.get<ApiChecklistItem[]>(`/checklist?cardId=${encodeURIComponent(cardId)}`);
          // Thay đúng phần của thẻ này, không đụng checklist của thẻ khác đang mở.
          const staleIds = store.entities().filter((i) => i.cardId === cardId).map((i) => i.id);
          patchState(store, removeEntities(staleIds), upsertEntities(rows.map(toItem)));
        } catch (e) {
          patchState(store, { loadedCardIds: withoutId(store.loadedCardIds(), cardId) }); // cho phép thử lại lần sau
          store.fail(describeError(e, 'Failed to load checklist.'));
        }
      },

      async addItem(cardId: string, content: string): Promise<void> {
        const text = content.trim();
        if (!text) return;
        try {
          const row = await api.post<ApiChecklistItem>('/checklist', { cardId, content: text });
          patchState(store, upsertEntity(toItem(row)));
        } catch (e) {
          store.fail(describeError(e, 'Failed to add checklist item.'));
        }
      },

      async toggleItem(cardId: string, itemId: string): Promise<void> {
        const before = store.entityMap()[itemId];
        if (!before) return;
        const isDone = !before.isDone;
        patchState(store, upsertEntity({ ...before, isDone }));

        try {
          await api.patch<ApiChecklistItem>(`/checklist/${itemId}`, { isDone });
        } catch (e) {
          patchState(store, upsertEntity(before));
          store.fail(describeError(e, 'Failed to save checklist item.'));
        }
      },

      async renameItem(cardId: string, itemId: string, content: string): Promise<void> {
        const text = content.trim();
        if (!text) return;
        const before = store.entityMap()[itemId];
        if (!before) return;
        patchState(store, upsertEntity({ ...before, content: text }));

        try {
          await api.patch<ApiChecklistItem>(`/checklist/${itemId}`, { content: text });
        } catch (e) {
          patchState(store, upsertEntity(before));
          store.fail(describeError(e, 'Failed to rename checklist item.'));
        }
      },

      async deleteItem(cardId: string, itemId: string): Promise<void> {
        const before = store.entityMap()[itemId];
        patchState(store, removeEntity(itemId));
        try {
          await api.delete(`/checklist/${itemId}`);
        } catch (e) {
          if (before) patchState(store, upsertEntity(before));
          store.fail(describeError(e, 'Failed to delete checklist item.'));
        }
      },
    })),
  );
}
