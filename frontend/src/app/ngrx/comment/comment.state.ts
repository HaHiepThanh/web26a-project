export interface CommentExtraState {
  /** Thẻ đã nạp bình luận ít nhất 1 lần — chỉ những thẻ này mới nhận sự kiện
   *  WebSocket, tránh giữ bình luận cho cả trăm thẻ chưa mở. */
  loadedCardIds: ReadonlySet<string>;
}

export const initialCommentState: CommentExtraState = {
  loadedCardIds: new Set<string>(),
};
