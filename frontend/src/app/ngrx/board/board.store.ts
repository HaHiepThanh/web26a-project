import { effect, inject, untracked } from '@angular/core';
import { signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { withEntities } from '@ngrx/signals/entities';
import { Board } from '../../models';
import { withErrorState } from '../shared/error.feature';
import { RouteContextStore } from '../route-context/route-context.store';
import { initialBoardState } from './board.state';
import { boardComputed } from './board.computed';
import { boardMethods } from './board.methods';
import { boardRealtimeHooks } from './board.realtime';

/** Thay `BoardService` cũ. Xem `ngrx/list/list.store.ts` về lý do ghép các
 *  mảnh trực tiếp thay vì tự bọc `signalStoreFeature` riêng cho từng file. */
export const BoardStore = signalStore(
  { providedIn: 'root' },
  withEntities<Board>(),
  withState(initialBoardState),
  withErrorState(),
  withComputed((store) => boardComputed(store)),
  withMethods((store) => boardMethods(store)),
  withHooks((store) => boardRealtimeHooks(store)),
  // Tự nạp lại đúng 1 board khi route đổi — xem chú thích trong `list.store.ts`.
  withHooks((store) => ({
    onInit() {
      const ctx = inject(RouteContextStore);
      effect(() => {
        const boardId = ctx.activeBoardId();
        if (boardId) untracked(() => store.loadBoard(boardId));
      });
    },
  })),
);
