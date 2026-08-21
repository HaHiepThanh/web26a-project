// [AI-CHAT] Contract giữa FRONTEND và BACKEND cho việc AI phát hiện tin giao task.
// Frontend KHÔNG gọi Claude trực tiếp — nó gọi endpoint backend (vd POST /ai/detect-task),
// backend mới gọi Claude API và trả về đúng 2 hình dạng dưới đây.
// Nhờ contract cố định này, FE có thể mock để dựng UI trước khi BE hoàn thiện.

// Rút gọn thông tin thành viên gửi kèm để AI map được assignee theo tên.
export interface DetectTaskMember {
  id: string; // userId
  displayName: string;
}

// FE -> BE
export interface DetectTaskRequest {
  boardId: string;
  content: string; // nội dung tin nhắn cần phân tích
  members: DetectTaskMember[]; // danh sách thành viên board để gợi ý assignee
}

// Card gợi ý mà AI trích ra được (khớp field với model Card khi tạo thật).
export interface TaskSuggestion {
  title: string;
  description?: string;
  assigneeId?: string; // đã map về userId, null nếu không rõ
  dueDate?: string; // 'YYYY-MM-DD', null nếu không có
}

// BE -> FE
export interface DetectTaskResponse {
  isTask: boolean; // tin nhắn có phải giao task không
  confidence: number; // 0..1 — độ tự tin của model
  suggestion: TaskSuggestion | null; // null khi isTask = false
}

/** Gợi ý tạo thẻ do AI phát hiện, đang chờ người dùng bấm xác nhận hoặc bỏ qua. */
export interface PendingSuggestion {
  id: string;
  sourceMessageId: string;
  suggestion: TaskSuggestion;
}
