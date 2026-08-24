export interface CardExtraState {
  /** id các card đang "lưu ngầm" — board hiển thị chấm nhấp nháy góc thẻ. */
  savingCardIds: ReadonlySet<string>;
  /** id các card vừa rollback lỗi — board chạy animation shake rồi tự xoá khỏi set này. */
  errorCardIds: ReadonlySet<string>;
  /** Board đang có dữ liệu card nạp trong bộ nhớ — public để Dashboard/Header biết
   *  đường link tới board khi hiển thị "việc của tôi". */
  loadedBoardId: string | null;
}

export const initialCardState: CardExtraState = {
  savingCardIds: new Set<string>(),
  errorCardIds: new Set<string>(),
  loadedBoardId: null,
};
