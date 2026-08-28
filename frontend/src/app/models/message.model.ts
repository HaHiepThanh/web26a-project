// [AI-CHAT] Tin nhắn trong khung chat của một board (chat gắn theo board).

/**
 * Ô trích dẫn hiện trên đầu một câu trả lời.
 *
 * ⚠️ CỐ Ý KHÔNG có trường `replyTo` lồng bên trong. Đây là chỗ chặn việc lồng
 *    vô hạn: A trả lời B, C trả lời A, D trả lời C… nếu kiểu này mang theo tổ
 *    tiên của nó thì mỗi tin kéo theo cả một chuỗi, và khung chat ~300px vỡ
 *    ngay ở tầng thứ ba. Độ sâu trích dẫn LUÔN đúng bằng 1.
 */
export interface MessageQuote {
  id: string;
  userId: string;
  /** Rỗng khi tin gốc đã bị thu hồi — backend không trả nội dung nữa. */
  content: string;
  deletedAt: string | null;
  user?: { displayName: string | null; avatarUrl: string | null } | null;
}

export interface Message {
  id: string; // uuid
  orgId: string; // FK organizations.id
  boardId: string; // FK boards.id — chat theo board
  userId: string; // FK auth.users.id — người gửi
  /** Rỗng khi đã thu hồi. UI hiện "Tin nhắn đã được thu hồi" thay cho nội dung. */
  content: string;
  createdAt: string; // ISO timestamptz
  /** Lần sửa gần nhất; null = chưa từng sửa. UI hiện "đã chỉnh sửa" cạnh giờ. */
  editedAt?: string | null;
  /** Thời điểm thu hồi; null = còn nguyên. */
  deletedAt?: string | null;
  /** Tin mà tin này trả lời. */
  replyToId?: string | null;
  replyTo?: MessageQuote | null;
  sourceCardId?: string; // nếu tin này đã được tạo thành card thì trỏ tới card đó
  user?: import('./user.model').User; // để hiển thị tên/avatar người gửi
}
