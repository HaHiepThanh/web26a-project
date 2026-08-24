import { computed } from '@angular/core';
import { signalStoreFeature, withComputed, type } from '@ngrx/signals';
import { EntityProps } from '@ngrx/signals/entities';
import { Label } from '../../models';

export function withLabelComputed() {
  return signalStoreFeature(
    { props: type<EntityProps<Label>>() },
    withComputed(({ entities }) => ({
      // Alias giữ tên cũ (`labels`) để component không phải sửa — nhãn của board
      // hiện tại là 1 mảng phẳng, không cần gom nhóm gì thêm.
      labels: computed(() => entities()),
    })),
  );
}
