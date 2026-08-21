// Card = thẻ công việc trong một list (#4).
export type CardPriority = 'low' | 'medium' | 'high';

export interface Card {
  id: string; // uuid
  orgId: string; // FK organizations.id
  listId: string; // FK lists.id
  title: string;
  description?: string; // nullable, hỗ trợ markdown đơn giản
  assigneeId?: string; // FK auth.users.id, nullable — người phụ trách
  dueDate?: string; // nullable, dạng 'YYYY-MM-DD'
  priority: CardPriority; // cột mới (CLAUDE.md #4), default 'medium' — xem migrations/0001_*.sql; dùng cho cờ ưu tiên (#4) và trang Workspace Stats
  completedAt?: string; // nullable, ISO timestamptz — set khi card được chuyển vào list "Done"; dùng để tính đúng hạn/thời gian xử lý
  position: number; // float — thứ tự trong list
  createdBy: string; // FK auth.users.id
  createdAt: string; // ISO timestamptz
  updatedAt: string; // ISO timestamptz
  // Gợi ý map khi mở card detail: labels?, checklistItems?, comments? (bonus).
}

/** Dữ liệu người dùng nhập ở form "Thêm thẻ" — khác `Card` (bản ghi trong DB):
 *  chưa có id/vị trí/người tạo, và `labelId` chỉ là nhãn chọn nhanh lúc tạo. */
export interface CreateCardInput {
  title: string;
  description?: string;
  priority: CardPriority;
  assigneeId?: string;
  dueDate?: string;
  labelId?: string | null;
}
