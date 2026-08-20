// [AI-CHAT] Tin nhắn trong khung chat của một board (chat gắn theo board).
// LƯU Ý: bảng `messages` CHƯA có trong databaseScheme.md — cần bổ sung ở DB:
//   messages(id, org_id, board_id, user_id, content, created_at,
//            source_card_id nullable)  -- source_card_id: card sinh ra từ tin nhắn này
export interface Message {
  id: string; // uuid
  orgId: string; // FK organizations.id
  boardId: string; // FK boards.id — chat theo board
  userId: string; // FK auth.users.id — người gửi
  content: string;
  createdAt: string; // ISO timestamptz
  sourceCardId?: string; // nếu tin này đã được tạo thành card thì trỏ tới card đó
  user?: import('./user.model').User; // để hiển thị tên/avatar người gửi
}
