import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

/**
 * "Đang ở đâu" — id tổ chức/board hiện đang mở, đọc từ route. Mỗi store domain
 * (List/Board/Card/...) tự `effect()` theo `activeBoardId()` để nạp lại dữ liệu
 * khi người dùng chuyển board, THAY VÌ chờ `pages/board/board.ts` gọi `load()`
 * tay cho từng service — đó là cách gỡ nút thắt board.ts (852 dòng, 12 service)
 * nói ở mục 4, `docs/ngrx/HOA-board-cong-tac.md`.
 *
 * Chỉ trang Board (và các nơi tương đương, vd BoardComponent's route resolver)
 * được GHI vào đây. Mọi nơi khác chỉ ĐỌC.
 */
export interface RouteContextState {
  activeOrgId: string | null;
  activeBoardId: string | null;
}

const initialState: RouteContextState = { activeOrgId: null, activeBoardId: null };

export const RouteContextStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setActiveBoard(boardId: string | null): void {
      if (store.activeBoardId() === boardId) return;
      patchState(store, { activeBoardId: boardId });
    },
    setActiveOrg(orgId: string | null): void {
      if (store.activeOrgId() === orgId) return;
      patchState(store, { activeOrgId: orgId });
    },
  })),
);
