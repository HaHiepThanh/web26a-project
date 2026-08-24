import { computed } from '@angular/core';
import { signalStoreFeature, withComputed, type } from '@ngrx/signals';
import { EntityProps } from '@ngrx/signals/entities';
import { ChecklistItem, ChecklistProgress } from '../../models';
import { groupBy } from '../shared/entity.util';

export function withChecklistComputed() {
  return signalStoreFeature(
    { props: type<EntityProps<ChecklistItem>>() },
    withComputed(({ entities }) => ({
      // Gom nhóm + sắp xếp ở đây, KHÔNG lưu trong state.
      itemsByCard: computed(() => {
        const map = groupBy(entities(), (i) => i.cardId);
        for (const arr of Object.values(map)) arr.sort((a, b) => a.position - b.position);
        return map;
      }),

      /** done/total theo từng card — dùng để hiện badge tiến độ ở mặt thẻ ngoài danh sách. */
      progressByCard: computed(() => {
        const result: Record<string, ChecklistProgress | undefined> = {};
        const map = groupBy(entities(), (i) => i.cardId);
        for (const [cardId, items] of Object.entries(map)) {
          if (!items.length) continue;
          result[cardId] = { done: items.filter((i) => i.isDone).length, total: items.length };
        }
        return result;
      }),
    })),
  );
}
