import { signalStoreFeature, withState, withMethods, patchState } from '@ngrx/signals';

export interface ErrorEntry {
  id: number;
  message: string;
}

/**
 * `lastError` lặp lại giống hệt nhau ở mọi store — gom một chỗ dùng chung.
 * `id` tăng dần để component phân biệt được hai lỗi trùng nội dung liên tiếp.
 */
export function withErrorState() {
  let seq = 0;

  return signalStoreFeature(
    withState({ lastError: null as ErrorEntry | null }),
    withMethods((store) => ({
      fail(message: string): void {
        seq++;
        patchState(store, { lastError: { id: seq, message } });
      },
    })),
  );
}
