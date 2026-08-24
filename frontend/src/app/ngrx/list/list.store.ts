import { effect, inject, untracked } from '@angular/core';
import { signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { withEntities } from '@ngrx/signals/entities';
import { List } from '../../models';
import { withErrorState } from '../shared/error.feature';
import { RouteContextStore } from '../route-context/route-context.store';
import { initialListState } from './list.state';
import { listComputed } from './list.computed';
import { listMethods } from './list.methods';
import { listRealtimeHooks } from './list.realtime';

/**
 * Store MẪU cho cả nhóm (Giai đoạn 0) — xem `docs/ngrx/HOA-board-cong-tac.md`.
 * Thay `ListService` cũ.
 *
 * `computed`/`methods`/`realtime` sống ở file riêng (đúng quy ước "mỗi mảnh một
 * vai trò"), nhưng được GHÉP TRỰC TIẾP ở đây bằng `withComputed`/`withMethods`/
 * `withHooks` — KHÔNG bọc riêng từng file bằng `signalStoreFeature({ state:
 * type<...>() }, ...)` rồi mới ghép, vì cách đó dính lỗi suy luận kiểu đã biết
 * của `@ngrx/signals` khi 2+ custom feature như vậy được định nghĩa ở NHIỀU HÀM
 * riêng rồi nối tiếp nhau (ngrx/platform#4274, chưa có bản vá thật). Ghép trực
 * tiếp tại đây thì TypeScript suy luận đúng kiểu `store` tại chỗ, không qua
 * ranh giới `SignalStoreFeature<Input,_>` nào.
 */
export const ListStore = signalStore(
  { providedIn: 'root' },
  withEntities<List>(),
  withState(initialListState),
  withErrorState(),
  withComputed((store) => listComputed(store)),
  withMethods((store) => listMethods(store)),
  withHooks((store) => listRealtimeHooks(store)),
  // Tự nạp lại mỗi khi người dùng mở board khác — KHÔNG chờ board.ts gọi tay
  // (mục 4: gỡ nút thắt board.ts). `pages/board/board.ts` chỉ còn báo
  // `RouteContextStore.setActiveBoard(id)`, mọi store domain tự lo phần còn lại.
  withHooks((store) => ({
    onInit() {
      const ctx = inject(RouteContextStore);
      effect(() => {
        const boardId = ctx.activeBoardId();
        if (boardId) untracked(() => store.loadLists(boardId));
      });
    },
  })),
);
