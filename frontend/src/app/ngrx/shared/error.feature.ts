import { patchState, signalStoreFeature, withMethods, withState } from '@ngrx/signals';

/**
 * Trạng thái lỗi + cờ nạp, lặp lại giống hệt ở mọi store — gom một chỗ dùng chung.
 *
 * ⚠️ Ba bạn từng viết ba bản khác nhau, trong đó `lastError` có hai kiểu đối lập
 *    (`string` với `{ id, message }`). Bản hợp nhất này giữ `{ id, message }` vì:
 *
 *    `id` tăng dần để component phân biệt được HAI LỖI LIÊN TIẾP CÙNG NỘI DUNG.
 *    board.ts dùng `effect()` đọc `lastError()` để bắn toast — cùng message y hệt
 *    mà không đổi `id` thì effect coi là "không đổi gì" và không hiện toast lần hai.
 *    Dùng `string` thuần là mất hẳn hành vi đó.
 */
export interface ErrorState {
  /** Đang có request chạy dở. */
  loading: boolean;
  /** Lỗi gần nhất, hoặc null nếu lần gọi vừa rồi thành công. */
  lastError: { id: number; message: string } | null;
}

export const initialErrorState: ErrorState = { loading: false, lastError: null };

let errorSeq = 0;

/**
 * Đóng gói một câu lỗi thành `{ id, message }`.
 *
 * Dùng khi cần ghi `lastError` CHUNG với các trường khác trong một `patchState`
 * duy nhất — lúc đó không gọi `fail()` được vì `fail()` tự patch riêng.
 */
export function loi(message: string): { id: number; message: string } {
  errorSeq++;
  return { id: errorSeq, message };
}

export function withErrorState() {
  return signalStoreFeature(
    withState<ErrorState>(initialErrorState),
    withMethods((store) => ({
      /** Ghi lỗi và tắt cờ nạp — đường dùng thường ngày. */
      fail(message: string): void {
        patchState(store, { loading: false, lastError: loi(message) });
      },
      /** Xoá lỗi mà không đụng `loading` — dùng khi người dùng đóng thông báo. */
      clearError(): void {
        patchState(store, { lastError: null });
      },
    })),
  );
}
