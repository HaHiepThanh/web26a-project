import { computed } from '@angular/core';
import { signalStoreFeature, withComputed, type } from '@ngrx/signals';
import { EntityProps } from '@ngrx/signals/entities';
import { Comment } from '../../models';
import { groupBy } from '../shared/entity.util';

export function withCommentComputed() {
  return signalStoreFeature(
    { props: type<EntityProps<Comment>>() },
    withComputed(({ entities }) => ({
      // Gom nhóm + sắp theo thời gian tạo — KHÔNG lưu trong state.
      commentsByCard: computed(() => {
        const map = groupBy(entities(), (c) => c.cardId);
        for (const arr of Object.values(map)) arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return map;
      }),

      /** Số bình luận theo từng card — dùng để hiện badge 💬 ở mặt thẻ ngoài danh sách. */
      countByCard: computed(() => {
        const result: Record<string, number | undefined> = {};
        for (const [cardId, list] of Object.entries(groupBy(entities(), (c) => c.cardId))) {
          if (list.length) result[cardId] = list.length;
        }
        return result;
      }),
    })),
  );
}
