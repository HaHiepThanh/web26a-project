import { DestroyRef, Injector, effect, inject, untracked } from '@angular/core';
import { signalStoreFeature, withHooks } from '@ngrx/signals';
import { BoardEvent, BoardEventType, UserEvent } from '../../models';
import { RealtimeService } from '../../services/realtime.service';

/*
 * ⚠️ File này có HAI cách cắm store vào WebSocket, vì ba bạn làm song song và
 *    chọn hai thiết kế khác nhau. Cả hai đều chạy được, giữ nguyên để không
 *    phải viết lại store của ai:
 *
 *      onBoardEvent(...)        — đọc signal `realtime.lastEvent()`  (Hoà, Hoàng)
 *      withRealtimeHandlers(..) — đăng ký vào sổ của RealtimeService (Huy)
 *
 *    Store MỚI nên chọn `withRealtimeHandlers`: nó tự gỡ đăng ký khi store bị
 *    huỷ, còn `onBoardEvent` dựa vào vòng đời của `effect()`.
 */

/**
 * Đăng ký lắng nghe sự kiện WebSocket khớp `types`, gọi lại `handle`.
 *
 * Dùng BÊN TRONG `withHooks({ onInit })` của mỗi store — xem `list.realtime.ts`
 * làm mẫu. `RealtimeService` chỉ phát ra sự kiện thô qua `lastEvent()`
 * (xem `services/realtime.service.ts`); mỗi store tự lọc đúng loại của mình và
 * tự quyết định áp vào state ra sao (thường là `upsertEntity`, KHÔNG BAO GIỜ
 * `addEntity` — xem mục 3 trong `docs/ngrx/HOA-board-cong-tac.md`).
 *
 * `effect()` gắn với injector đang chạy (store's `onInit`) nên tự huỷ theo vòng
 * đời của store — không cần dọn tay.
 */
export function onBoardEvent(
  realtime: RealtimeService,
  types: readonly BoardEventType[],
  handle: (event: BoardEvent) => void,
): void {
  effect(() => {
    const event = realtime.lastEvent();
    if (!event || !types.includes(event.type)) return;
    // Tách khỏi vùng theo dõi của effect: `handle` thường gọi `patchState`, gọi
    // trong lúc effect đang track dễ vô tình tạo phụ thuộc chéo không mong muốn.
    untracked(() => handle(event));
  });
}

/**
 * Cắm store vào luồng WebSocket mà không phải đụng `realtime.service.ts`.
 *
 * Trước đây `RealtimeService` tự biết mọi service dữ liệu và gọi thẳng vào từng
 * cái — thêm một loại sự kiện là phải sửa file đó, mà nó lại là file chung của
 * cả ba người. Giờ chiều phụ thuộc đảo lại: store tự nói mình quan tâm sự kiện
 * nào, `RealtimeService` chỉ phát đi và không biết ai nghe.
 *
 * Cách dùng trong `<mien>.realtime.ts`:
 *
 * ```ts
 * export function withListRealtime() {
 *   return withRealtimeHandlers((store) => ({
 *     board: {
 *       'list.created': (row: ApiList) => store.applyRemote(row),
 *       'list.updated': (row: ApiList) => store.applyRemote(row),
 *       'list.deleted': ({ id }: { id: string }) => store.removeLocally(id),
 *     },
 *   }));
 * }
 * ```
 *
 * ⚠️ Đăng ký ở đây thì phải XOÁ nhánh tương ứng trong `switch` của
 *    `realtime.service.ts` trong CÙNG PR. Để cả hai là một sự kiện bị áp hai lần.
 */

/** Bảng ánh xạ tên sự kiện → hàm xử lý. `data` để `any` phía người dùng tự ép kiểu. */
export interface RealtimeHandlers {
  /** Sự kiện trong phòng board (`board:event`). */
  board?: Record<string, (data: never, event: BoardEvent) => void>;
  /** Sự kiện riêng của người dùng (`user:event`, phòng `user:<uid>`). */
  user?: Record<string, (data: never, event: UserEvent) => void>;
}

export function withRealtimeHandlers<Store extends object>(
  factory: (store: Store) => RealtimeHandlers,
) {
  return signalStoreFeature(
    withHooks({
      onInit(store) {
        const injector = inject(Injector);
        const destroyRef = inject(DestroyRef);
        const handlers = factory(store as unknown as Store);

        const offs: Array<() => void> = [];
        // Store bị huỷ trước khi microtask chạy (hay gặp trong test) thì đừng
        // đăng ký nữa — đăng ký xong không ai gỡ là handler sống mãi.
        let stopped = false;

        // ⚠️ Lấy RealtimeService ở microtask kế tiếp, KHÔNG inject thẳng ở đây.
        //
        //    RealtimeService inject BoardService, mà BoardService lại inject
        //    OrganizationStore — inject đồng bộ tại chỗ này là Angular báo
        //    NG0200 "Circular dependency" và cả app không khởi động được.
        //
        //    Hoãn một nhịp thì store đã tạo xong trước khi RealtimeService cần
        //    tới nó, nên vòng tự mở. Không mất sự kiện nào: socket còn chưa kết
        //    nối xong ở thời điểm này.
        queueMicrotask(() => {
          if (stopped) return;
          const realtime = injector.get(RealtimeService);
          for (const [type, handler] of Object.entries(handlers.board ?? {})) {
            offs.push(realtime.onBoardEvent(type, handler as (d: unknown, e: BoardEvent) => void));
          }
          for (const [type, handler] of Object.entries(handlers.user ?? {})) {
            offs.push(realtime.onUserEvent(type, handler as (d: unknown, e: UserEvent) => void));
          }
        });

        // Store `providedIn: 'root'` sống suốt phiên nên hiếm khi chạy tới đây,
        // nhưng test thì destroy liên tục — không gỡ là handler của test trước
        // còn dính sang test sau và state nhảy lung tung.
        destroyRef.onDestroy(() => {
          stopped = true;
          for (const off of offs) off();
        });
      },
    }),
  );
}
