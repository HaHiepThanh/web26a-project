// [AI-CHAT] Hợp đồng cho phần AI phát hiện tin giao việc.
//
// ⚠️ Frontend KHÔNG gọi Gemini. Việc phân tích chạy ở SERVER, trong luồng
//    `POST /chat`: server lưu tin nhắn → gọi Gemini → lưu gợi ý xuống bảng
//    `chat_task_suggestions` → phát WebSocket cho cả board.
//
//    Bản trước có `POST /ai/detect-task` để frontend tự gọi rồi tự quyết định.
//    Cách đó có hai chỗ hỏng: chỉ NGƯỜI GỬI thấy gợi ý (người được giao việc thì
//    không), và mỗi client lại phân tích lại cùng một tin nhắn.

/** Mức ưu tiên — khớp `CardPriority`. */
export type SuggestedPriority = 'high' | 'medium' | 'low';

/** Một thẻ AI đề xuất. Khớp field với `Card` để tạo thẳng, không phải map. */
export interface SuggestedCard {
  title: string;
  description?: string;
  /** Firebase uid — server đã đối chiếu với thành viên board, không phải id bịa. */
  assigneeId?: string;
  /** 'YYYY-MM-DD'. */
  dueDate?: string;
  /** Cột sẽ thêm thẻ vào — server đã đối chiếu với cột thật của board. */
  listId?: string;
  priority?: SuggestedPriority;
}

export type SuggestionStatus = 'pending' | 'accepted' | 'dismissed';

/** Gợi ý tạo thẻ gắn với MỘT tin nhắn, lưu ở database nên F5 không mất. */
export interface ChatTaskSuggestion {
  id: string;
  orgId: string;
  boardId: string;
  /** Tin nhắn sinh ra gợi ý này — dùng để vẽ chip ngay dưới đúng câu đó. */
  messageId: string;
  /** Người GỬI tin nhắn gốc (không phải người bấm chấp nhận). */
  createdBy: string;
  status: SuggestionStatus;
  cards: SuggestedCard[];
  model: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}
