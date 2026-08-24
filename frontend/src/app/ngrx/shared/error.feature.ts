import { patchState, signalStoreFeature, withMethods, withState } from '@ngrx/signals';

/**
 * `lastError` lặp lại giống hệt nhau ở mọi store (list, board, chat...) — tách
 * ra một lần, mỗi store chỉ cần gọi `withErrorState()`.
 *
 * `id` tăng dần để component phân biệt được hai lỗi liên tiếp có cùng nội dung
 * (board.ts dùng `effect()` đọc `lastError()` để bắn toast — cùng message y hệt
 * mà không đổi `id` thì effect coi là "không đổi gì", không hiện toast lần hai).
 */
export interface ErrorState {
  lastError: { id: number; message: string } | null;
}

export const initialErrorState: ErrorState = { lastError: null };

let errorSeq = 0;

export function withErrorState() {
  return signalStoreFeature(
    withState<ErrorState>(initialErrorState),
    withMethods((store) => ({
      fail(message: string): void {
        errorSeq++;
        patchState(store, { lastError: { id: errorSeq, message } });
      },
      clearError(): void {
        patchState(store, { lastError: null });
      },
    })),
  );
}
