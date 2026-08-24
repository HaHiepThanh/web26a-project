export interface TaskSuggestionOwnState {
  /** Id gợi ý đang mở trong modal — `null` = modal đóng. Lưu id (không lưu cả
   *  object) để tự cập nhật khi gợi ý đổi trạng thái trong lúc đang mở. */
  openedId: string | null;
}

export const initialTaskSuggestionState: TaskSuggestionOwnState = { openedId: null };
