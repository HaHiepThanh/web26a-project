import { inject, Signal } from '@angular/core';
import { patchState, WritableStateSource } from '@ngrx/signals';
import { EntityState, removeEntity, setAllEntities, upsertEntity } from '@ngrx/signals/entities';
import { describeError } from '../../services/api-error.util';
import { ApiService } from '../../services/api.service';
import { ApiList, List } from '../../models';
import { midpoint } from '../shared/entity.util';
import type { ErrorState } from '../shared/error.feature';
import { ListOwnState } from './list.state';
import { toList } from './list.mapper';

type Store = WritableStateSource<EntityState<List> & ListOwnState & ErrorState> & {
  lists: Signal<List[]>;
  loadedBoardId: Signal<string | null>;
  loading: Signal<boolean>;
  fail: (message: string) => void;
};

/**
 * Hàm generic thuần — xem chú thích trong `list.computed.ts` về lý do không
 * bọc `signalStoreFeature` riêng cho từng file.
 *
 * `inject(ApiService)` chỉ gọi ĐÚNG MỘT LẦN ở đây (lúc `withMethods` dựng
 * store, còn trong injection context) — KHÔNG gọi lại bên trong từng method,
 * vì lúc method chạy (do click chuột, effect...) không còn injection context
 * nữa và `inject()` sẽ ném lỗi NG0203.
 */
export function listMethods<S extends Store>(store: S, api = inject(ApiService)) {
  return {
    /**
     * Áp một cột nhận từ WebSocket (người khác vừa tạo/đổi tên/kéo) — luôn
     * upsert, "có id rồi thì ghi đè, chưa có thì thêm vào" (mục 3 của tài liệu).
     */
    applyRemote(r: ApiList): void {
      patchState(store, upsertEntity(toList(r)));
    },

    applyRemoteDeleted(id: string): void {
      patchState(store, removeEntity(id));
    },

    async loadLists(boardId: string, force = false): Promise<void> {
      if (!boardId) {
        patchState(store, setAllEntities<List>([]), { loadedBoardId: null, loading: false });
        return;
      }
      if (!force && store.loadedBoardId() === boardId && !store.loading()) return;
      patchState(store, setAllEntities<List>([]), { loading: true, loadedBoardId: boardId });
      try {
        const rows = await api.get<ApiList[]>(`/lists?boardId=${boardId}`);
        patchState(store, setAllEntities(rows.map(toList)), { loading: false });
      } catch (e) {
        patchState(store, setAllEntities<List>([]), { loading: false });
        store.fail(describeError(e, 'Failed to load lists.'));
      }
    },

    async createList(boardId: string, name: string): Promise<List | null> {
      const trimmed = name.trim();
      if (!trimmed) return null;
      try {
        // position do BACKEND tính (cột mới luôn về cuối) — client không tự đoán.
        const row = await api.post<ApiList>('/lists', { boardId, name: trimmed });
        // ⚠️ Sự kiện WebSocket `list.created` có thể về TRƯỚC khi POST trả lời —
        //    upsert ở đây, KHÔNG `addEntity`, nếu không cột hiện HAI LẦN.
        const list = toList(row);
        patchState(store, upsertEntity(list));
        return list;
      } catch (e) {
        store.fail(describeError(e, 'Failed to create list.'));
        return null;
      }
    },

    async renameList(id: string, name: string): Promise<void> {
      const trimmed = name.trim();
      if (!trimmed) return;
      const previous = store.lists();
      patchState(store, upsertEntity({ ...previous.find((l) => l.id === id)!, name: trimmed }));
      try {
        await api.patch<ApiList>(`/lists/${id}`, { name: trimmed });
      } catch (e) {
        patchState(store, setAllEntities(previous));
        store.fail(describeError(e, 'Failed to rename list.'));
      }
    },

    async deleteList(id: string): Promise<void> {
      const previous = store.lists();
      patchState(store, removeEntity(id));
      try {
        await api.delete(`/lists/${id}`);
      } catch (e) {
        patchState(store, setAllEntities(previous));
        store.fail(describeError(e, 'Failed to delete list.'));
      }
    },

    /**
     * Kéo-thả đổi thứ tự cột: cập nhật giao diện ngay, gọi API ngầm, hỏng thì
     * hoàn tác. `position` là số THỰC nên chỉ cột được kéo cần đổi — xem
     * `midpoint()` ở `ngrx/shared/entity.util.ts`.
     */
    async reorderListOptimistic(orderedIds: string[]): Promise<void> {
      const previous = store.lists();

      // Cột nào vừa đổi chỗ so với thứ tự cũ? KHÔNG đoán bằng "vị trí đầu tiên
      // khác nhau" — xem chú thích gốc ở `list.service.ts` (đã xoá) để hiểu vì
      // sao cách đoán đó sai khi kéo A xuống cuối.
      const oldOrder = previous.map((l) => l.id);
      const movedId = orderedIds.find((id) => {
        const conLaiCu = oldOrder.filter((x) => x !== id);
        const conLaiMoi = orderedIds.filter((x) => x !== id);
        return conLaiCu.every((x, i) => x === conLaiMoi[i]);
      });
      if (!movedId) return; // thả về đúng chỗ cũ — không có gì để lưu

      const destIndex = orderedIds.indexOf(movedId);
      const neighbours = orderedIds
        .filter((id) => id !== movedId)
        .map((id) => previous.find((l) => l.id === id))
        .filter((l): l is List => !!l);

      const before = neighbours[destIndex - 1];
      const after = neighbours[destIndex];
      const position = midpoint(before?.position, after?.position);

      const next = orderedIds
        .map((id) => {
          const l = previous.find((x) => x.id === id);
          return l ? { ...l, position: l.id === movedId ? position : l.position } : null;
        })
        .filter((l): l is List => l !== null);
      patchState(store, setAllEntities(next));

      try {
        await api.patch<ApiList>(`/lists/${movedId}/position`, { position });
      } catch (e) {
        patchState(store, setAllEntities(previous));
        store.fail(describeError(e, 'Failed to save list order — reverted.'));
      }
    },
  };
}
