// [BONUS #4] Bình luận trong card.
export interface Comment {
  id: string; // uuid
  cardId: string; // FK cards.id
  userId: string; // FK auth.users.id
  content: string;
  createdAt: string; // ISO timestamptz
  user?: import('./user.model').User; // để hiển thị tên/avatar người bình luận
}
