import { signalStoreFeature, withMethods, patchState, type } from '@ngrx/signals';
import { EntityState, EntityProps, upsertEntity, removeEntities } from '@ngrx/signals/entities';
import { ApiCard, Card } from '../../models';
import { toCard } from './card.mapper';

/** Handler cho thay đổi đến từ WebSocket (tạo/sửa/kéo/xoá bởi người khác, hoặc
 *  cascade từ list bị xoá) — `realtime.service.ts` gọi các hàm này. */
export function withCardRealtime() {
  return signalStoreFeature(
    { state: type<EntityState<Card>>(), props: type<EntityProps<Card>>() },
    withMethods((store) => ({
      // Với state phẳng, `upsertEntity` theo id là đủ: thẻ đổi cột chỉ đổi field
      // `listId` của đúng entity đó, không cần gỡ khỏi "bucket cũ" như hồi còn
      // Record<listId, Card[]> — `cardsByList` ở withComputed tự gom lại đúng cột.
      applyRemoteCard(row: ApiCard): void {
        patchState(store, upsertEntity(toCard(row)));
      },

      applyRemoteCardDeleted(id: string): void {
        patchState(store, removeEntities([id]));
      },

      /** Xoá toàn bộ card của 1 list (khi xoá list kèm thẻ bên trong, cascade
       *  hoặc optimistic ngay khi người dùng bấm xoá list). */
      clearListCards(listId: string): void {
        const ids = store.entities().filter((c) => c.listId === listId).map((c) => c.id);
        if (ids.length) patchState(store, removeEntities(ids));
      },
    })),
  );
}
