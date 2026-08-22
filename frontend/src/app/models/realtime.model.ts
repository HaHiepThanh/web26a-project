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
  | 'board.deleted';

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
} as const;
