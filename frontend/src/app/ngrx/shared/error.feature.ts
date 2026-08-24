import { computed } from '@angular/core';
import { patchState, signalStoreFeature, withComputed, withMethods, withState } from '@ngrx/signals';
import { describeError } from '../../services/api-error.util';

/**
 * Trạng thái nạp/lỗi lặp lại ở mọi store — gom vào một chỗ thay vì chép đi chép lại.
 *
 * Ba store đầu tiên viết ra đều có đúng bộ `loading` + `lastError` này, và mỗi
 * nơi đặt tên một kiểu (`error`, `loadError`, `errMsg`) khiến component phải nhớ
 * store nào dùng tên gì. Feature này chốt một tên duy nhất cho cả app.
 */
export interface ErrorState {
  /** Đang có request chạy dở. */
  loading: boolean;
  /**
   * Câu lỗi tiếng Việt hiển thị được, hoặc null nếu lần gọi gần nhất thành công.
   *
   * ⚠️ Phân biệt với "danh sách rỗng": rỗng vì lỗi mạng KHÁC HẲN rỗng vì người
   *    dùng chưa có gì. Guard phải đọc trường này để không đá người ta sang
   *    /onboarding chỉ vì backend chết một nhịp.
   */
  lastError: string | null;
}

export const initialErrorState: ErrorState = {
  loading: false,
  lastError: null,
};

export function withErrorState() {
  return signalStoreFeature(
    withState<ErrorState>(initialErrorState),

    withComputed(({ lastError }) => ({
      /** Có lỗi hay không — dùng trong template cho gọn, khỏi so sánh null. */
      hasError: computed(() => lastError() !== null),
    })),

    withMethods((store) => ({
      /** Bắt đầu một lần gọi API: bật cờ nạp và xoá lỗi cũ. */
      startLoading(): void {
        patchState(store, { loading: true, lastError: null });
      },

      /** Kết thúc thành công. */
      finishLoading(): void {
        patchState(store, { loading: false, lastError: null });
      },

      /**
       * Kết thúc thất bại. Nhận thẳng lỗi bắt được, tự đổi sang câu tiếng Việt
       * bằng `describeError` — nơi gọi không phải tự dịch lỗi HTTP nữa.
       */
      failLoading(e: unknown, macDinh?: string): void {
        patchState(store, { loading: false, lastError: describeError(e, macDinh) });
      },

      /** Xoá lỗi mà không đụng tới `loading` — dùng khi người dùng đóng thông báo. */
      clearError(): void {
        patchState(store, { lastError: null });
      },
    })),
  );
}
