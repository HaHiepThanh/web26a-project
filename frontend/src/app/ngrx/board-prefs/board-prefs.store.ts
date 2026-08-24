import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { ApiHighlightGroup, ApiSavedFilter } from '../../models';
import { ApiService } from '../../services/api.service';
import { describeError } from '../../services/api-error.util';
import { withErrorState } from '../shared/error.feature';

/**
 * Store nhỏ (< 150 dòng ở service gốc) — chỉ `store.ts`, không tách thêm file
 * theo mục "Chia theo kích thước, đừng máy móc" của tài liệu. Không dùng
 * `withEntities`: `starredBoardIds` là một Set id tham chiếu board ở `BoardStore`,
 * không phải danh sách bản ghi riêng; bộ lọc/nhóm highlight chỉ là API
 * pass-through, không cache — y hệt `board-prefs.service.ts` cũ.
 */
export interface BoardPrefsState {
  starredBoardIds: ReadonlySet<string>;
}

const initialState: BoardPrefsState = { starredBoardIds: new Set() };

export const BoardPrefsStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withErrorState(),
  withMethods((store, api = inject(ApiService)) => ({
    // ------------------------------------------------------------ gắn sao

    async loadStars(): Promise<void> {
      try {
        const ids = await api.get<string[]>('/stars');
        patchState(store, { starredBoardIds: new Set(ids) });
      } catch {
        // Không báo lỗi ồn ào: mất danh sách sao chỉ làm ngôi sao hiện sai.
        patchState(store, { starredBoardIds: new Set() });
      }
    },

    isStarred(boardId: string): boolean {
      return store.starredBoardIds().has(boardId);
    },

    /** Bật/tắt sao. Đổi trên màn hình ngay, hỏng thì trả lại. */
    async toggleStar(boardId: string): Promise<void> {
      const truoc = store.starredBoardIds();
      const dangSao = truoc.has(boardId);

      const next = new Set(truoc);
      if (dangSao) next.delete(boardId);
      else next.add(boardId);
      patchState(store, { starredBoardIds: next });

      try {
        if (dangSao) await api.delete(`/stars/${boardId}`);
        else await api.post(`/stars/${boardId}`, {});
      } catch (e) {
        patchState(store, { starredBoardIds: truoc });
        store.fail(describeError(e, 'Failed to save star.'));
      }
    },

    // ------------------------------------------------------- bộ lọc đã lưu

    async loadFilters(boardId: string): Promise<ApiSavedFilter[]> {
      try {
        return await api.get<ApiSavedFilter[]>(`/saved-filters?boardId=${encodeURIComponent(boardId)}`);
      } catch (e) {
        store.fail(describeError(e, 'Failed to load saved filters.'));
        return [];
      }
    },

    async createFilter(input: {
      boardId: string;
      name: string;
      assigneeIds: string[];
      labelIds: string[];
      priorities: string[];
      dateFilter: string | null;
    }): Promise<ApiSavedFilter | null> {
      try {
        return await api.post<ApiSavedFilter>('/saved-filters', input);
      } catch (e) {
        store.fail(describeError(e, 'Failed to save filter.'));
        return null;
      }
    },

    async removeFilter(id: string): Promise<boolean> {
      try {
        await api.delete(`/saved-filters/${id}`);
        return true;
      } catch (e) {
        store.fail(describeError(e, 'Failed to delete filter.'));
        return false;
      }
    },

    // ---------------------------------------------------- nhóm highlight

    async loadGroups(boardId: string): Promise<ApiHighlightGroup[]> {
      try {
        return await api.get<ApiHighlightGroup[]>(`/highlight-groups?boardId=${encodeURIComponent(boardId)}`);
      } catch (e) {
        store.fail(describeError(e, 'Failed to load highlight groups.'));
        return [];
      }
    },

    async createGroup(input: { boardId: string; name: string; cardIds: string[] }): Promise<ApiHighlightGroup | null> {
      try {
        return await api.post<ApiHighlightGroup>('/highlight-groups', input);
      } catch (e) {
        store.fail(describeError(e, 'Failed to save highlight group.'));
        return null;
      }
    },

    async removeGroup(id: string): Promise<boolean> {
      try {
        await api.delete(`/highlight-groups/${id}`);
        return true;
      } catch (e) {
        store.fail(describeError(e, 'Failed to delete highlight group.'));
        return false;
      }
    },
  })),
);
