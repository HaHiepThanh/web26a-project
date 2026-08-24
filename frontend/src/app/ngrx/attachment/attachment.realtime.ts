import { signalStoreFeature, withMethods, patchState, type } from '@ngrx/signals';
import { EntityState, EntityProps, upsertEntity, upsertEntities, removeEntity, removeEntities } from '@ngrx/signals/entities';
import { ApiAttachment, Attachment } from '../../models';
import { toAttachment } from './attachment.mapper';
import { AttachmentExtraState } from './attachment.state';

/** Handler cho thay đổi đến từ WebSocket. Chỉ áp vào thẻ ĐÃ mở — thẻ chưa mở
 *  thì bỏ qua, lần đầu mở sẽ `loadAttachments()` lấy đủ. */
export function withAttachmentRealtime() {
  return signalStoreFeature(
    {
      state: type<EntityState<Attachment> & AttachmentExtraState>(),
      props: type<EntityProps<Attachment>>(),
    },
    withMethods((store) => ({
      /** Upsert theo id, và tự gỡ cờ bìa của ảnh khác khi ảnh này vừa thành bìa. */
      applyRemote(r: ApiAttachment): void {
        const att = toAttachment(r);
        if (!(att.cardId in store.loadedAt())) return;

        if (att.isCover) {
          const oldCovers = store.entities().filter((a) => a.cardId === att.cardId && a.id !== att.id && a.isCover);
          patchState(store, upsertEntities([att, ...oldCovers.map((a) => ({ ...a, isCover: false }))]));
        } else {
          patchState(store, upsertEntity(att));
        }
      },

      applyRemoteDeleted(cardId: string, id: string): void {
        if (!(cardId in store.loadedAt())) return;
        patchState(store, removeEntity(id));
      },

      clearCard(cardId: string): void {
        const nextLoadedAt = { ...store.loadedAt() };
        delete nextLoadedAt[cardId];
        patchState(store, { loadedAt: nextLoadedAt });

        const ids = store.entities().filter((a) => a.cardId === cardId).map((a) => a.id);
        if (ids.length) patchState(store, removeEntities(ids));
      },
    })),
  );
}
