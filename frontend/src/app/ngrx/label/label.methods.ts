import { inject } from '@angular/core';
import { signalStoreFeature, withMethods, patchState, type } from '@ngrx/signals';
import { EntityState, setAllEntities, upsertEntity } from '@ngrx/signals/entities';
import { ApiLabel, Label } from '../../models';
import { ApiService } from '../../services/api.service';
import { describeError } from '../../services/api-error.util';
import { toLabel } from './label.mapper';
import { LabelExtraState } from './label.state';

/**
 * Nhãn màu theo board + gắn/gỡ nhãn cho thẻ — GỌI BACKEND THẬT.
 *
 * `cardLabelIds` là bảng nối, không phải entity store — hoàn tác cũng phải
 * theo ĐÚNG MỘT card (một khoá trong map), không `set()` lại cả map, để không
 * xoá mất thay đổi của thẻ khác đến qua WebSocket giữa lúc chờ API.
 */
export function withLabelMethods() {
  return signalStoreFeature(
    {
      state: type<EntityState<Label> & LabelExtraState>(),
      methods: type<{ fail(message: string): void }>(),
    },
    withMethods((store, api = inject(ApiService)) => {
      // Hàm cục bộ thay vì `store.attachLabel(...)`: các method trong CÙNG một
      // `withMethods` không gọi lẫn nhau qua `store` được — TypeScript suy ra
      // kiểu của `store` từ INPUT khai báo, không phải từ chính OUTPUT đang định
      // nghĩa. `setCardLabels`/`toggleCardLabel` dùng lại đúng 2 hàm này.
      async function attach(cardId: string, labelId: string): Promise<void> {
        const before = store.cardLabelIds()[cardId] ?? [];
        if (before.includes(labelId)) return;
        patchState(store, { cardLabelIds: { ...store.cardLabelIds(), [cardId]: [...before, labelId] } });

        try {
          await api.post(`/labels/cards/${cardId}/${labelId}`, {});
        } catch (e) {
          // Chỉ trả lại đúng khoá `cardId` này — thẻ khác đổi trong lúc chờ vẫn còn.
          patchState(store, { cardLabelIds: { ...store.cardLabelIds(), [cardId]: before } });
          store.fail(describeError(e, 'Failed to attach label.'));
        }
      }

      async function detach(cardId: string, labelId: string): Promise<void> {
        const before = store.cardLabelIds()[cardId] ?? [];
        if (!before.includes(labelId)) return;
        patchState(store, {
          cardLabelIds: { ...store.cardLabelIds(), [cardId]: before.filter((id) => id !== labelId) },
        });

        try {
          await api.delete(`/labels/cards/${cardId}/${labelId}`);
        } catch (e) {
          patchState(store, { cardLabelIds: { ...store.cardLabelIds(), [cardId]: before } });
          store.fail(describeError(e, 'Failed to detach label.'));
        }
      }

      return {
        async loadLabels(boardId: string, force = false): Promise<void> {
          if (!boardId) {
            patchState(store, setAllEntities<Label>([]), { loadedBoardId: null });
            return;
          }
          if (!force && store.loadedBoardId() === boardId) return;
          patchState(store, { loadedBoardId: boardId });
          try {
            const rows = await api.get<ApiLabel[]>(`/labels?boardId=${boardId}`);
            patchState(store, setAllEntities(rows.map(toLabel)));
          } catch (e) {
            patchState(store, setAllEntities<Label>([]));
            store.fail(describeError(e, 'Failed to load labels.'));
          }
        },

        async createLabel(boardId: string, name: string, color: string): Promise<Label | null> {
          const trimmed = name.trim();
          if (!trimmed) return null;
          try {
            const row = await api.post<ApiLabel>('/labels', { boardId, name: trimmed, color });
            // Upsert theo id — sự kiện `label.created` có thể về trước phản hồi HTTP.
            patchState(store, upsertEntity(toLabel(row)));
            return toLabel(row);
          } catch (e) {
            store.fail(describeError(e, 'Failed to create label.'));
            return null;
          }
        },

        attachLabel: attach,
        detachLabel: detach,

        /** Ghi đè toàn bộ danh sách nhãn của 1 thẻ (dùng khi lưu picker) — gọi API
         *  cho phần chênh lệch, không xoá sạch rồi gắn lại (thừa request, dễ mất dữ liệu). */
        async setCardLabels(cardId: string, labelIds: string[]): Promise<void> {
          const current = store.cardLabelIds()[cardId] ?? [];
          const toAdd = labelIds.filter((id) => !current.includes(id));
          const toRemove = current.filter((id) => !labelIds.includes(id));
          await Promise.all([...toAdd.map((id) => attach(cardId, id)), ...toRemove.map((id) => detach(cardId, id))]);
        },

        toggleCardLabel(cardId: string, labelId: string): void {
          const current = store.cardLabelIds()[cardId] ?? [];
          if (current.includes(labelId)) void detach(cardId, labelId);
          else void attach(cardId, labelId);
        },
      };
    }),
  );
}
