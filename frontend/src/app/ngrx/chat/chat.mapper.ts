import { ApiMessage, Message } from '../../models';

/**
 * MỘT hàm ánh xạ cho mọi đường vào: danh sách, tin vừa gửi, và cả hai sự kiện
 * WebSocket. Backend đã thống nhất một hình dạng nên ở đây không cần hai bản.
 */
export function toMessage(r: ApiMessage): Message {
  return {
    id: r.id,
    orgId: r.orgId,
    boardId: r.boardId,
    userId: r.userId,
    content: r.content,
    createdAt: r.createdAt,
    editedAt: r.editedAt ?? null,
    deletedAt: r.deletedAt ?? null,
    replyToId: r.replyToId ?? null,
    replyTo: r.replyTo ?? null,
    user: r.user
      ? { id: r.userId, displayName: r.user.displayName ?? '', email: '', avatarUrl: r.user.avatarUrl ?? undefined }
      : undefined,
  };
}
