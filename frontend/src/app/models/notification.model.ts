/** Thông báo hiện ở chuông 🔔 trên Header. */
export interface AppNotification {
  id: string;
  /** `card.assigned` tới qua WebSocket ngay lúc có người gán việc; `card.overdue`
   *  do client tự dựng sau khi hỏi `GET /cards/my-due` (không có sự kiện realtime
   *  cho việc "thẻ vừa quá hạn" — nó xảy ra do thời gian trôi, không do ai bấm gì). */
  type:
    | 'card.assigned'
    | 'card.overdue'
    | 'meeting.started'
    | 'chat.mention'
    | 'meeting.scheduled';
  /** Câu hiển thị đầy đủ, dựng sẵn lúc nhận để khỏi phải tra lại tên board/workspace. */
  text: string;
  /** Bấm vào thì đi đâu — route là `/:orgSlug/board/:boardId`. */
  orgSlug: string;
  boardId: string;
  /** Thẻ liên quan — `meeting.*` và `chat.mention` không gắn với thẻ nào, nên
   *  để rỗng. Điều hướng chỉ cần `orgSlug` + `boardId`. */
  cardId: string;
  createdAt: string;
  read: boolean;
}

/** Một dòng `GET /cards/my-due` — thẻ quá hạn được giao cho tôi, ở bất kỳ board nào. */
export interface ApiOverdueCard {
  cardId: string;
  title: string;
  dueDate: string;
  daysOverdue: number;
  boardId: string;
  boardName: string;
  workspaceName: string;
  orgSlug: string;
}
