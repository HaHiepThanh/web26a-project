import { inject, Signal } from '@angular/core';
import { patchState, WritableStateSource } from '@ngrx/signals';
import { ApiService } from '../../services/api.service';
import { describeError } from '../../services/api-error.util';
import type { ApiBoardMember } from '../../models';
import type { ErrorState } from '../shared/error.feature';
import { withId } from '../shared/entity.util';
import { toBoardMemberView } from './manage-workspace.mapper';
import {
  initialManageWorkspaceState,
  type BoardMemberView,
  type ManageWorkspaceState,
} from './manage-workspace.state';

type Store = WritableStateSource<ManageWorkspaceState & ErrorState> & {
  membersByBoard: Signal<Record<string, BoardMemberView[]>>;
  loadedBoardIds: Signal<ReadonlySet<string>>;
  fail(message: string): void;
};

/** Hàm generic thuần — xem chú thích trong `ngrx/list/list.methods.ts` về lý do
 *  không tự bọc `signalStoreFeature` riêng cho từng file. */
export function manageWorkspaceMethods<S extends Store>(store: S, api = inject(ApiService)) {
  /** Không ném lỗi ra ngoài: `loadMany` gọi hàm này N lần song song, một board
   *  hỏng không được phép làm hỏng cả mẻ. */
  async function fetchOne(
    boardId: string,
  ): Promise<{ rows?: BoardMemberView[]; error?: string }> {
    try {
      const rows = await api.get<ApiBoardMember[]>(`/boards/${boardId}/members`);
      return { rows: rows.map(toBoardMemberView) };
    } catch (e) {
      return { error: describeError(e, 'Failed to load project members.') };
    }
  }

  return {
    /** Thành viên của 1 board. Rỗng khi chưa nạp — dùng `hasLoaded` để phân biệt. */
    membersOf(boardId: string): BoardMemberView[] {
      return store.membersByBoard()[boardId] ?? [];
    },

    hasLoaded(boardId: string): boolean {
      return store.loadedBoardIds().has(boardId);
    },

    async loadBoardMembers(boardId: string, force = false): Promise<void> {
      if (!boardId) return;
      if (!force && store.loadedBoardIds().has(boardId)) return;

      patchState(store, { loading: true });
      const { rows, error } = await fetchOne(boardId);
      if (!rows) {
        store.fail(error ?? 'Failed to load project members.');
        return;
      }
      patchState(store, {
        membersByBoard: { ...store.membersByBoard(), [boardId]: rows },
        loadedBoardIds: withId(store.loadedBoardIds(), boardId),
        loading: false,
        lastError: null,
      });
    },

    /**
     * Nạp nhiều board CÙNG LÚC — màn danh sách project cần đếm thành viên của
     * mọi board để vẽ dãy avatar. Gọi tuần tự là N vòng mạng nối đuôi nhau.
     */
    async loadManyBoardMembers(boardIds: readonly string[], force = false): Promise<void> {
      const canNap = force
        ? [...new Set(boardIds)]
        : [...new Set(boardIds)].filter((id) => !store.loadedBoardIds().has(id));
      if (canNap.length === 0) return;

      patchState(store, { loading: true });
      const results = await Promise.all(canNap.map(fetchOne));

      // Gom thành ĐÚNG MỘT patchState. Patch trong vòng lặp là N lần chạy lại
      // computed của mọi component đang mở, chỉ để tới cùng một kết quả.
      const nextMembers = { ...store.membersByBoard() };
      let loaded = store.loadedBoardIds();
      let hong = 0;
      canNap.forEach((id, i) => {
        const rows = results[i].rows;
        if (!rows) {
          hong++;
          return;
        }
        nextMembers[id] = rows;
        loaded = withId(loaded, id);
      });

      patchState(store, {
        membersByBoard: nextMembers,
        loadedBoardIds: loaded,
        loading: false,
        lastError: null,
      });
      if (hong > 0) store.fail(`Failed to load members for ${hong} project(s).`);
    },

    /**
     * Ghi lại tập thành viên của board — CHỈ có nghĩa với board `private`.
     *
     * `board_members` là danh sách "ai được xem board riêng tư" (xem chú thích
     * bảng đó trong `database.sql`). Board `workspace`/`public` không đọc bảng
     * này: thành viên của chúng chính là thành viên workspace/tổ chức, nên nơi
     * gọi phải tự chặn trước, ở đây không đoán hộ.
     *
     * `PATCH /boards/:id` thay THẲNG cả tập (backend xoá sạch rồi chèn lại), nên
     * truyền vào danh sách ĐẦY ĐỦ sau khi sửa, không phải phần chênh lệch.
     */
    async setBoardMembers(boardId: string, members: BoardMemberView[]): Promise<string | null> {
      const before = store.membersByBoard()[boardId];

      // Cập nhật giao diện trước cho mượt — hỏng thì trả lại ĐÚNG khoá này,
      // không `set()` lại cả map (một board khác vừa nạp xong sẽ bị xoá mất).
      patchState(store, {
        membersByBoard: { ...store.membersByBoard(), [boardId]: members },
      });

      try {
        await api.patch(`/boards/${boardId}`, { memberIds: members.map((m) => m.userId) });
        return null;
      } catch (e) {
        const next = { ...store.membersByBoard() };
        if (before) next[boardId] = before;
        else delete next[boardId];
        patchState(store, { membersByBoard: next });
        return describeError(e, 'Failed to save the project member list.');
      }
    },

    /** Đăng xuất / đổi tài khoản — dọn sạch, không để dữ liệu người trước sót lại. */
    clearAll(): void {
      patchState(store, initialManageWorkspaceState);
    },
  };
}
