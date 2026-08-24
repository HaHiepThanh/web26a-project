import { computed, Signal } from '@angular/core';
import { List } from '../../models';

/**
 * Hàm generic THUẦN (không tự bọc `signalStoreFeature`) — ghép trực tiếp trong
 * `list.store.ts` qua `withComputed((store) => listComputed(store))`.
 *
 * Lý do KHÔNG dùng `signalStoreFeature({ state: type<...>() }, withComputed(...))`
 * tách rời như bản đầu: khi 2-3 feature kiểu đó được đặt trong CÁC FILE/HÀM
 * KHÁC NHAU rồi ghép nối tiếp nhau, TypeScript báo sai kiểu — đây là lỗi đã biết
 * của `@ngrx/signals` (ngrx/platform#4274), chưa có bản vá thật tính tới thời
 * điểm viết file này. Cách ở đây né được lỗi vì không có ranh giới
 * `SignalStoreFeature<Input,_>` nào cả — `withComputed` suy luận kiểu `store`
 * trực tiếp từ đúng vị trí gọi trong `signalStore(...)`.
 *
 * `entities()` trả về theo thứ tự CHÈN, không theo `position` — phải tự sắp lại
 * (quy ước #6 trong docs/ngrx/HOA-board-cong-tac.md). Tên `lists` giữ nguyên như
 * API cũ của `ListService` để component không phải đổi gì ngoài chỗ inject.
 */
export function listComputed(store: { entities: Signal<List[]> }) {
  return {
    lists: computed(() => [...store.entities()].sort((a, b) => a.position - b.position)),
  };
}
