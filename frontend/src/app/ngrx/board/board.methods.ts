import { inject, Signal } from '@angular/core';
import { patchState, WritableStateSource } from '@ngrx/signals';
import { EntityState, upsertEntity } from '@ngrx/signals/entities';
import { describeError } from '../../services/api-error.util';
import { ApiService } from '../../services/api.service';
import { ApiBoard, Board, BoardBackground, BoardVisibility } from '../../models';
import type { ErrorState } from '../shared/error.feature';
import { BoardOwnState } from './board.state';
import { toBoard } from './board.mapper';
import { LocalBoardOverride, persistLocalBoardOverrides } from './board.local-image.util';

type Store = WritableStateSource<EntityState<Board> & BoardOwnState & ErrorState> & {
  entities: Signal<Board[]>;
  boards: Signal<Board[]>;
  workspaceBoardIds: Signal<string[]>;
  allBoardIds: Signal<string[]>;
  localOverrides: Signal<BoardOwnState['localOverrides']>;
};

/** Hàm generic thuần — xem chú thích trong `ngrx/list/list.computed.ts` (và
 *  `ngrx/list/list.methods.ts` về việc `inject(ApiService)` chỉ gọi một lần ở đây). */
export function boardMethods<S extends Store>(store: S, api = inject(ApiService)) {
  /** Ghi xuống localStorage. Vỡ quota (ảnh nền base64 nặng) thì bỏ ảnh, giữ board. */
  function persistOrDropImage(boardId: string): void {
    patchState(store, { storageWarning: null });
    if (persistLocalBoardOverrides(store.localOverrides())) return;
    const local = store.localOverrides()[boardId];
    if (!local?.backgroundImageUrl) return;
    const next = { ...store.localOverrides(), [boardId]: { ...local, backgroundImageUrl: undefined } };
    patchState(store, { localOverrides: next });
    persistLocalBoardOverrides(next);
    patchState(store, { storageWarning: 'Browser storage is full — board was saved but the background image could not be.' });
  }

  function localFor(boardId: string): LocalBoardOverride | undefined {
    return store.localOverrides()[boardId];
  }

  return {
    /** Áp thay đổi board nhận từ WebSocket — chỉ `name`/`visibility`, màu/ảnh
     *  nền vẫn ở localStorage (server chưa lưu được ảnh). */
    applyRemoteBoard(r: ApiBoard): void {
      const current = store.entities().find((b) => b.id === r.id);
      const merged = toBoard(r, localFor(r.id));
      patchState(store, upsertEntity(current ? { ...merged, ...current, name: r.name, visibility: r.visibility } : merged));
    },

    async loadBoards(workspaceId: string): Promise<void> {
      if (!workspaceId) {
        patchState(store, { workspaceBoardIds: [] });
        return;
      }
      patchState(store, { loading: true, loadError: null });
      try {
        const rows = await api.get<ApiBoard[]>(`/boards?workspaceId=${workspaceId}`);
        for (const row of rows) patchState(store, upsertEntity(toBoard(row, localFor(row.id))));
        patchState(store, { workspaceBoardIds: rows.map((r) => r.id), loading: false });
      } catch (e) {
        patchState(store, { loadError: describeError(e, 'Failed to load boards.'), workspaceBoardIds: [], loading: false });
      }
    },

    /** Gộp board của TẤT CẢ workspace — Dashboard Chat hub liệt kê mọi hội thoại. */
    async loadAllBoards(workspaceIds: string[] = []): Promise<void> {
      if (!workspaceIds.length) {
        patchState(store, { allBoardIds: [] });
        return;
      }
      const perWorkspace = await Promise.all(
        workspaceIds.map((id) => api.get<ApiBoard[]>(`/boards?workspaceId=${id}`).catch(() => [] as ApiBoard[])),
      );
      const rows = perWorkspace.flat();
      for (const row of rows) patchState(store, upsertEntity(toBoard(row, localFor(row.id))));
      patchState(store, { allBoardIds: rows.map((r) => r.id) });
    },

    async loadBoard(boardId: string): Promise<void> {
      patchState(store, { loadError: null });
      try {
        const row = await api.get<ApiBoard>(`/boards/${boardId}`);
        patchState(store, upsertEntity(toBoard(row, localFor(row.id))), { currentBoardId: row.id });
      } catch (e) {
        // 404 = không tồn tại HOẶC không thuộc tổ chức của mình (backend cố ý gộp
        // hai trường hợp để người ngoài không dò được id nào có thật).
        patchState(store, { currentBoardId: null, loadError: describeError(e, 'Failed to open board.') });
      }
    },

    async createBoard(
      workspaceId: string,
      name: string,
      options?: { visibility?: BoardVisibility; memberIds?: string[]; background?: BoardBackground; backgroundImageUrl?: string },
    ): Promise<Board | null> {
      const title = name.trim();
      if (!title) return null;

      let row: ApiBoard;
      try {
        // Id do SERVER cấp. Quyền riêng tư + danh sách người xem gửi LUÔN trong POST.
        row = await api.post<ApiBoard>('/boards', {
          workspaceId,
          name: title,
          visibility: options?.visibility ?? 'workspace',
          ...(options?.visibility === 'private' ? { memberIds: options.memberIds ?? [] } : {}),
        });
        if (options?.background) {
          try {
            row = await api.patch<ApiBoard>(`/boards/${row.id}`, { background: options.background });
          } catch {
            patchState(store, { loadError: 'Board created, but background color failed to save.' });
          }
        }
      } catch (e) {
        patchState(store, { loadError: describeError(e, 'Failed to create board.') });
        return null;
      }

      // Màu/ảnh nền backend chưa lưu được → giữ ở trình duyệt, khoá theo id THẬT.
      const local: LocalBoardOverride = { background: options?.background, backgroundImageUrl: options?.backgroundImageUrl };
      const nextOverrides = { ...store.localOverrides(), [row.id]: local };
      patchState(store, { localOverrides: nextOverrides });
      const board = toBoard(row, local);
      patchState(store, upsertEntity(board), { workspaceBoardIds: [...store.workspaceBoardIds(), row.id] });
      persistOrDropImage(row.id);
      return board;
    },

    async updateBoard(
      id: string,
      changes: Partial<Pick<Board, 'name' | 'visibility' | 'background' | 'backgroundImageUrl'>>,
    ): Promise<string | null> {
      const patch: { name?: string; visibility?: BoardVisibility; background?: string | null } = {};
      if (changes.name !== undefined) patch.name = changes.name;
      if (changes.visibility !== undefined) patch.visibility = changes.visibility;
      // MÀU nền giờ xuống database. Gửi `null` khi người dùng gỡ nền về mặc định.
      if (changes.background !== undefined) patch.background = changes.background ?? null;

      if (Object.keys(patch).length > 0) {
        try {
          await api.patch<ApiBoard>(`/boards/${id}`, patch);
        } catch (e) {
          return describeError(e, 'Failed to update board.');
        }
      }

      const currentLocal = store.localOverrides()[id];
      if (changes.background !== undefined || changes.backgroundImageUrl !== undefined) {
        const nextLocal: LocalBoardOverride = {
          background: changes.background !== undefined ? changes.background : currentLocal?.background,
          backgroundImageUrl: changes.backgroundImageUrl !== undefined ? changes.backgroundImageUrl : currentLocal?.backgroundImageUrl,
        };
        patchState(store, { localOverrides: { ...store.localOverrides(), [id]: nextLocal } });
      }

      const existing = store.entities().find((b) => b.id === id);
      if (existing) patchState(store, upsertEntity({ ...existing, ...changes }));
      persistOrDropImage(id);
      return null;
    },

    async deleteBoard(id: string): Promise<string | null> {
      // Xoá trên server TRƯỚC — xoá giao diện trước rồi server hỏng là màn hình
      // lệch với database cho tới lần F5 kế tiếp.
      try {
        await api.delete(`/boards/${id}`);
      } catch (e) {
        return describeError(e, 'Failed to delete board.');
      }
      patchState(store, {
        workspaceBoardIds: store.workspaceBoardIds().filter((x) => x !== id),
        allBoardIds: store.allBoardIds().filter((x) => x !== id),
      });
      const nextOverrides = { ...store.localOverrides() };
      delete nextOverrides[id];
      patchState(store, { localOverrides: nextOverrides });
      persistLocalBoardOverrides(nextOverrides);
      return null;
    },
  };
}
