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
  | 'label.updated'
  | 'label.deleted'
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
  | 'attachment.deleted'
  /** AI vừa đề xuất tạo thẻ từ một tin nhắn — chip hiện lên ở mọi người trong board. */
  | 'suggestion.created'
  /** Ai đó đã chấp nhận hoặc bỏ qua gợi ý — chip tắt ở mọi máy. */
  | 'suggestion.resolved';

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
  | 'card.assigned'
  /** Ai đó trong tổ chức vừa đổi avatar hoặc tên hiển thị. */
  | 'user.updated'
  /** Có người mở cuộc họp trên board mình tham gia. */
  | 'meeting.started'
  /** Có người @nhắc tên mình trong chat của một board. */
  | 'chat.mention'
  /** Có người hẹn một cuộc họp và mời mình — báo NGAY lúc tạo. */
  | 'meeting.scheduled'
  /** Cuộc họp mình được mời vừa bị huỷ. */
  | 'meeting.canceled';

/**
 * Payload của `meeting.scheduled` / `meeting.canceled`.
 *
 * Đủ để dựng câu thông báo và điều hướng tới `/:orgSlug/board/:boardId` mà
 * không phải gọi thêm API — cùng nguyên tắc với `CardAssignedPayload`.
 *
 * `startAt` là ISO 8601 (thời điểm tuyệt đối). Trình duyệt tự đổi sang giờ địa
 * phương của người xem, nên hai người ở hai múi giờ đều đọc ra đúng giờ của
 * mình mà server không phải làm gì.
 */
export interface MeetingPingPayload {
  meetingId: string;
  boardId: string;
  boardName: string;
  orgSlug: string;
  title: string;
  startAt: string;
  byUserName: string;
}

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

/** Payload chung của `meeting.started` và `chat.mention` — đủ để dựng câu thông
 *  báo và bấm vào là tới đúng board, không phải gọi thêm API nào. */
export interface BoardPingPayload {
  boardId: string;
  boardName: string;
  orgSlug: string;
  byUserName: string;
  /** Chỉ có ở `chat.mention`: trích đoạn tin nhắn để người đọc biết ngữ cảnh. */
  excerpt?: string;
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
