export interface ChecklistExtraState {
  /** Thẻ đã nạp checklist rồi — tránh gọi lại API mỗi lần mở lại cùng một thẻ. */
  loadedCardIds: ReadonlySet<string>;
}

export const initialChecklistState: ChecklistExtraState = {
  loadedCardIds: new Set<string>(),
};
