import { signalStoreFeature, withMethods, patchState, type } from '@ngrx/signals';
import { EntityState, removeEntity, upsertEntity } from '@ngrx/signals/entities';
import { ApiLabel, Label } from '../../models';
import { toLabel } from './label.mapper';
import { LabelExtraState } from './label.state';

/** Handler cho thay đổi đến từ WebSocket. */
export function withLabelRealtime() {
  return signalStoreFeature(
    { state: type<EntityState<Label> & LabelExtraState>() },
    withMethods((store) => ({
      /** Áp nhãn mới nhận từ WebSocket — có rồi thì ghi đè, chưa có thì thêm. */
      applyRemoteLabel(r: ApiLabel): void {
        patchState(store, upsertEntity(toLabel(r)));
      },

      applyRemoteRemoveLabel(id: string): void {
        patchState(store, removeEntity(id));
      },

      applyRemoteAttach(cardId: string, labelId: string): void {
        const current = store.cardLabelIds()[cardId] ?? [];
        if (current.includes(labelId)) return;
        patchState(store, { cardLabelIds: { ...store.cardLabelIds(), [cardId]: [...current, labelId] } });
      },

      applyRemoteDetach(cardId: string, labelId: string): void {
        const current = store.cardLabelIds()[cardId] ?? [];
        if (!current.includes(labelId)) return;
        patchState(store, {
          cardLabelIds: { ...store.cardLabelIds(), [cardId]: current.filter((id) => id !== labelId) },
        });
      },
    })),
  );
}
