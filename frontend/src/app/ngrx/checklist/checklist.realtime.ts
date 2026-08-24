import { signalStoreFeature, withMethods, patchState, type } from '@ngrx/signals';
import { EntityState, EntityProps, upsertEntity, removeEntity, removeEntities } from '@ngrx/signals/entities';
import { ApiChecklistItem, ChecklistItem } from '../../models';
import { toItem } from './checklist.mapper';
import { ChecklistExtraState } from './checklist.state';
import { withoutId } from '../shared/entity.util';

/** Handler cho thay đổi đến từ WebSocket (người khác sửa checklist trên cùng board). */
export function withChecklistRealtime() {
  return signalStoreFeature(
    {
      state: type<EntityState<ChecklistItem> & ChecklistExtraState>(),
      props: type<EntityProps<ChecklistItem>>(),
    },
    withMethods((store) => ({
      /** Upsert theo id — sự kiện có thể về TRƯỚC phản hồi HTTP của chính mình.
       *  Thẻ chưa mở (chưa `loadChecklist`) thì bỏ qua — lần đầu mở sẽ tự lấy đủ. */
      applyRemoteItem(row: ApiChecklistItem): void {
        if (!store.loadedCardIds().has(row.cardId)) return;
        patchState(store, upsertEntity(toItem(row)));
      },

      applyRemoteDeleted(cardId: string, itemId: string): void {
        if (!store.loadedCardIds().has(cardId)) return;
        patchState(store, removeEntity(itemId));
      },

      /** Dọn checklist của 1 card khỏi bộ nhớ (khi xoá card) — database tự cascade. */
      clearCard(cardId: string): void {
        patchState(store, { loadedCardIds: withoutId(store.loadedCardIds(), cardId) });
        const ids = store.entities().filter((i) => i.cardId === cardId).map((i) => i.id);
        if (ids.length) patchState(store, removeEntities(ids));
      },
    })),
  );
}
