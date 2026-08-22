/**
 * HỢP ĐỒNG SỰ KIỆN REALTIME — bản sao y hệt của
 * backend/src/modules/realtime/realtime.events.ts. Sửa bên nào phải sửa cả bên kia.
 */
export type BoardEventType =
  | 'list.created'
  | 'list.updated'
  | 'list.deleted'
  | 'card.created'
  | 'card.updated'
  | 'card.moved'
  | 'card.deleted'
  | 'label.created'
  | 'label.attached'
  | 'label.detached'
  | 'comment.created'
  | 'comment.deleted'
  | 'chat.message'
  | 'activity.created'
  | 'board.updated'
  | 'board.deleted'
  | 'checklist.changed'
  | 'checklist.deleted'
  | 'attachment.changed'
  | 'attachment.deleted';

/**
 * Sự kiện gửi tới ĐÚNG MỘT NGƯỜI, không phụ thuộc họ đang mở board nào.
 * Phòng nhận là `user:<uid>` — lời mời vào tổ chức thì người nhận còn chưa
 * thuộc tổ chức đó, không có board nào để mà vào phòng.
 */
export type UserEventType =
  | 'invite.created'
  | 'invite.responded'
  | 'member.removed'
  /** Được giao phụ trách một thẻ — chuông 🔔 ở Header sáng lên. */
  | 'card.assigned';

/** Payload của `card.assigned` — mang sẵn đủ thứ để vẽ dòng thông báo và điều hướng. */
export interface CardAssignedPayload {
  cardId: string;
  cardTitle: string;
  boardId: string;
  boardName: string;
  workspaceName: string;
  orgSlug: string;
  byUserName: string;
}

export interface UserEvent<T = unknown> {
  type: UserEventType;
  actorId: string;
  data: T;
}

export interface BoardEvent<T = unknown> {
  type: BoardEventType;
  boardId: string;
  /** uid người gây ra thay đổi — dùng để KHÔNG tự báo "có người vừa..." cho chính mình. */
  actorId: string;
  data: T;
}

/** Một người đang mở board (hiển thị dãy avatar ở thanh tiêu đề). */
export interface BoardViewer {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface PresenceEvent {
  boardId: string;
  viewers: BoardViewer[];
}

/** Tên sự kiện — phải khớp hằng số `WS` ở backend. */
export const WS = {
  JOIN: 'board:join',
  LEAVE: 'board:leave',
  EVENT: 'board:event',
  PRESENCE: 'board:presence',
  /** server → client: việc riêng của chính người này (lời mời vào tổ chức...) */
  USER_EVENT: 'user:event',
} as const;
