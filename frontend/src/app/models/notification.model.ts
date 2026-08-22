/** Thông báo hiện ở chuông 🔔 trên Header. */
export interface AppNotification {
  id: string;
  type: 'card.assigned';
  /** Câu hiển thị đầy đủ, dựng sẵn lúc nhận để khỏi phải tra lại tên board/workspace. */
  text: string;
  /** Bấm vào thì đi đâu — route là `/:orgSlug/board/:boardId`. */
  orgSlug: string;
  boardId: string;
  cardId: string;
  createdAt: string;
  read: boolean;
}
