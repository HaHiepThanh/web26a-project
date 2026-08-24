import { computed, inject } from '@angular/core';
import { signalStoreFeature, withComputed, type } from '@ngrx/signals';
import { EntityProps } from '@ngrx/signals/entities';
import { Card } from '../../models';
import { AuthService } from '../../services/auth.service';
import { groupBy } from '../shared/entity.util';

/** Số ngày tính là "sắp đến hạn" (chỉ tính toán tại chỗ, không cron job). */
const DUE_SOON_WINDOW_DAYS = 3;

export function withCardComputed() {
  return signalStoreFeature(
    { props: type<EntityProps<Card>>() },
    withComputed(({ entities }, auth = inject(AuthService)) => ({
      // Gom nhóm + sắp xếp ở đây, KHÔNG lưu trong state. Giữ nguyên tên/hình dạng
      // để component không phải sửa gì.
      cardsByList: computed(() => {
        const map = groupBy(entities(), (c) => c.listId);
        for (const arr of Object.values(map)) arr.sort((a, b) => a.position - b.position);
        return map;
      }),

      /** Toàn bộ thẻ gán cho "tôi" (bất kể hạn) — dùng cho mục "Việc của tôi" ở Dashboard. */
      myCards: computed(() => {
        const me = auth.currentUserId();
        return entities().filter((c) => c.assigneeId === me);
      }),

      /** Đếm thẻ của "tôi" quá hạn / sắp đến hạn — dùng cho banner ở board + badge 🔔 ở Header. */
      myDueCounts: computed(() => {
        const me = auth.currentUserId();
        const today = new Date().toISOString().slice(0, 10);
        const soonLimit = new Date(today);
        soonLimit.setDate(soonLimit.getDate() + DUE_SOON_WINDOW_DAYS);
        const soonLimitStr = soonLimit.toISOString().slice(0, 10);

        let overdue = 0;
        let dueSoon = 0;
        for (const c of entities()) {
          if (c.assigneeId !== me || !c.dueDate) continue;
          if (c.dueDate < today) overdue++;
          else if (c.dueDate <= soonLimitStr) dueSoon++;
        }
        return { overdue, dueSoon };
      }),
    })),
  );
}
