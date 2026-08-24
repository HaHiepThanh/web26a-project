import { signalStoreFeature, withMethods, patchState, type } from '@ngrx/signals';
import { EntityState, EntityProps, upsertEntity, removeEntity, removeEntities } from '@ngrx/signals/entities';
import { Comment } from '../../models';
import { CommentExtraState } from './comment.state';
import { withoutId } from '../shared/entity.util';

/**
 * Handler cho thay đổi đến từ WebSocket.
 *
 * Chỉ nạp vào những thẻ ĐÃ mở (`loadedCardIds`). Thẻ chưa mở thì bỏ qua: lần
 * đầu mở thẻ đó `loadComments()` sẽ lấy đủ từ server — giữ sẵn bình luận cho
 * cả trăm thẻ chỉ để phòng hờ là phí bộ nhớ.
 */
export function withCommentRealtime() {
  return signalStoreFeature(
    {
      state: type<EntityState<Comment> & CommentExtraState>(),
      props: type<EntityProps<Comment>>(),
    },
    withMethods((store) => ({
      applyRemoteComment(comment: Comment): void {
        if (!store.loadedCardIds().has(comment.cardId)) return;
        patchState(store, upsertEntity(comment));
      },

      applyRemoteCommentDeleted(cardId: string, commentId: string): void {
        if (!store.loadedCardIds().has(cardId)) return;
        patchState(store, removeEntity(commentId));
      },

      /** Dọn bình luận của 1 card khỏi bộ nhớ (khi xoá card) — database tự cascade. */
      clearCard(cardId: string): void {
        patchState(store, { loadedCardIds: withoutId(store.loadedCardIds(), cardId) });
        const ids = store.entities().filter((c) => c.cardId === cardId).map((c) => c.id);
        if (ids.length) patchState(store, removeEntities(ids));
      },
    })),
  );
}
