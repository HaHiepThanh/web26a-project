import { ApiComment, Comment } from '../../models';

/** `GET /comments` không trả `cardId` (đã lọc theo query) — phải truyền tay. */
export function toComment(r: ApiComment, cardId: string): Comment {
  return {
    id: r.id,
    cardId,
    userId: r.userId,
    content: r.content,
    createdAt: r.createdAt,
    // Backend join sang `users` nên trả kèm tên/ảnh; model `Comment` chỉ cần
    // userId, còn tên hiển thị lấy từ khối `user` khi vẽ.
    user: r.user
      ? {
          id: r.userId,
          email: '',
          displayName: r.user.displayName ?? undefined,
          avatarUrl: r.user.avatarUrl ?? undefined,
        }
      : undefined,
  };
}
