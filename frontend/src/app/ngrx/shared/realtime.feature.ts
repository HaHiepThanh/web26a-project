import { effect, untracked } from '@angular/core';
import { BoardEvent, BoardEventType } from '../../models';
import { RealtimeService } from '../../services/realtime.service';

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
