/**
 * HỢP ĐỒNG SỰ KIỆN REALTIME — bản sao y hệt nằm ở
 * frontend/src/app/models/realtime.model.ts. Sửa bên nào phải sửa cả bên kia.
 *
 * Chỉ có ĐÚNG MỘT tên sự kiện đi từ server xuống client: `board:event`. Mọi loại
 * thay đổi phân biệt nhau bằng trường `type`.
 *
 * Vì sao không đặt mỗi loại một tên riêng (`card.created`, `card.updated`...)?
 * Vì client sẽ phải nhớ đăng ký đủ 15 listener, quên một cái là im lặng hỏng mà
 * không có lỗi nào báo. Gộp một chỗ thì frontend chỉ có 1 `switch`, thiếu nhánh
 * nào TypeScript báo ngay.
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
  /** Board mà thay đổi này thuộc về — cũng chính là tên phòng đã phát. */
  boardId: string;
  /** uid của người gây ra thay đổi. Client dùng để không báo "có người vừa..." cho chính mình. */
  actorId: string;
  /** Dữ liệu kèm theo — thường là bản ghi vừa tạo/sửa, hoặc `{ id }` khi xoá. */
  data: T;
}

/** Một người đang mở board. */
export interface BoardViewer {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/** Server → client khi có người vào/rời board. */
export interface PresenceEvent {
  boardId: string;
  viewers: BoardViewer[];
}

/** Tên các sự kiện, gom một chỗ để không gõ sai chuỗi ở hai đầu. */
export const WS = {
  /** client → server: xin vào phòng của 1 board */
  JOIN: 'board:join',
  /** client → server: rời phòng */
  LEAVE: 'board:leave',
  /** server → client: có thay đổi dữ liệu trong board */
  EVENT: 'board:event',
  /** server → client: danh sách người đang mở board thay đổi */
  PRESENCE: 'board:presence',
} as const;
