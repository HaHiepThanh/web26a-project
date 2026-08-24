/** Phần state riêng của List, ngoài những gì `withEntities`/`withErrorState` đã lo. */
export interface ListOwnState {
  loading: boolean;
  /** Board đã nạp lần gần nhất — nạp lại board cũ thì bỏ qua, giống cache cũ ở
   *  `list.service.ts` (`loadedBoardId`). */
  loadedBoardId: string | null;
}

export const initialListState: ListOwnState = {
  loading: false,
  loadedBoardId: null,
};
