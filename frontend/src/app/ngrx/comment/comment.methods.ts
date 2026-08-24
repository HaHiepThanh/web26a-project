import { inject, Signal } from '@angular/core';
import { signalStoreFeature, withMethods, patchState, type } from '@ngrx/signals';
import { EntityState, EntityProps, upsertEntity, removeEntity, removeEntities, upsertEntities } from '@ngrx/signals/entities';
import { ApiComment, ApiCreatedComment, Comment } from '../../models';
import { ApiService } from '../../services/api.service';
import { describeError } from '../../services/api-error.util';
import { AuthService } from '../../services/auth.service';
import { toComment } from './comment.mapper';
import { CommentExtraState } from './comment.state';
import { withId } from '../shared/entity.util';

interface CommentMethodsProps extends EntityProps<Comment> {
  commentsByCard: Signal<Record<string, Comment[]>>;
}

/**
 * Bình luận trong card — GỌI BACKEND THẬT.
 *
 * `loadComments` nạp theo yêu cầu (mở modal thẻ mới gọi), không tải sẵn cả
 * board: một board có thể có hàng trăm thẻ. Gọi lại thì luôn nạp mới (không
 * cache) — khác với `CardStore`/`ChecklistStore`.
 */
export function withCommentMethods() {
  return signalStoreFeature(
    {
      state: type<EntityState<Comment> & CommentExtraState>(),
      props: type<CommentMethodsProps>(),
      methods: type<{ fail(message: string): void }>(),
    },
    withMethods((store, api = inject(ApiService), auth = inject(AuthService)) => ({
      commentsFor(cardId: string): Comment[] {
        return store.commentsByCard()[cardId] ?? [];
      },

      /** Nạp bình luận của 1 thẻ. Gọi khi mở modal chi tiết thẻ. */
      async loadComments(cardId: string): Promise<void> {
        if (!cardId) return;
        try {
          const rows = await api.get<ApiComment[]>(`/comments?cardId=${cardId}`);
          const staleIds = store.entities().filter((c) => c.cardId === cardId).map((c) => c.id);
          patchState(
            store,
            removeEntities(staleIds),
            upsertEntities(rows.map((r) => toComment(r, cardId))),
            { loadedCardIds: withId(store.loadedCardIds(), cardId) },
          );
        } catch (e) {
          store.fail(describeError(e, 'Failed to load comments.'));
        }
      },

      async addComment(cardId: string, content: string): Promise<void> {
        const text = content.trim();
        if (!text) return;
        try {
          const row = await api.post<ApiCreatedComment>('/comments', { cardId, content: text });
          const me = auth.currentUser();
          const comment: Comment = {
            id: row.id,
            cardId,
            userId: row.userId,
            content: row.content,
            createdAt: row.createdAt,
            user: me ?? undefined,
          };
          // Upsert theo id — sự kiện `comment.created` có thể về trước phản hồi HTTP.
          patchState(store, upsertEntity(comment));
        } catch (e) {
          store.fail(describeError(e, 'Failed to send comment.'));
        }
      },

      /** Backend chỉ cho TÁC GIẢ xoá — người khác gọi sẽ nhận 403, không phải kiểm tra ở đây. */
      async deleteComment(cardId: string, commentId: string): Promise<void> {
        const before = store.entityMap()[commentId];
        patchState(store, removeEntity(commentId));
        try {
          await api.delete(`/comments/${commentId}`);
        } catch (e) {
          if (before) patchState(store, upsertEntity(before));
          store.fail(describeError(e, 'Failed to delete comment.'));
        }
      },
    })),
  );
}
