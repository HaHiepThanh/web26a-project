import { computed } from '@angular/core';
import { signalStoreFeature, withComputed, type } from '@ngrx/signals';
import { EntityProps } from '@ngrx/signals/entities';
import { Attachment } from '../../models';
import { groupBy } from '../shared/entity.util';

export function withAttachmentComputed() {
  return signalStoreFeature(
    { props: type<EntityProps<Attachment>>() },
    withComputed(({ entities }) => ({
      // Gom nhóm + sắp theo thời gian tạo — KHÔNG lưu trong state.
      attachmentsByCard: computed(() => {
        const map = groupBy(entities(), (a) => a.cardId);
        for (const arr of Object.values(map)) arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return map;
      }),

      /** Số đính kèm theo card — dùng để hiện badge 📎 ở mặt thẻ ngoài danh sách. */
      countByCard: computed(() => {
        const result: Record<string, number | undefined> = {};
        for (const [cardId, list] of Object.entries(groupBy(entities(), (a) => a.cardId))) {
          if (list.length) result[cardId] = list.length;
        }
        return result;
      }),

      /** URL ảnh bìa theo card — mặt thẻ ngoài danh sách dùng để vẽ ảnh bìa. */
      coverUrlByCard: computed(() => {
        const result: Record<string, string | undefined> = {};
        for (const [cardId, list] of Object.entries(groupBy(entities(), (a) => a.cardId))) {
          const cover = list.find((a) => a.isCover && a.isImage);
          if (cover?.url) result[cardId] = cover.url;
        }
        return result;
      }),
    })),
  );
}
