// Mức độ ưu tiên thẻ (CLAUDE.md #4) — dùng trong modal tạo thẻ ở #2.
export type CardPriority = 'cao' | 'trung' | 'thap';

// Card = thẻ công việc trong một list (#4).
export interface Card {
  id: string; // uuid
  tenantId: string; // FK tenants.id
  listId: string; // FK lists.id
  title: string;
  description?: string; // nullable, hỗ trợ markdown đơn giản
  assigneeId?: string; // FK auth.users.id, nullable — người phụ trách
  dueDate?: string; // nullable, dạng 'YYYY-MM-DD'
  priority: CardPriority; // cột mới (CLAUDE.md #4), default 'trung' — xem migrations/0001_*.sql
  position: number; // float — thứ tự trong list
  canvasX?: number; // vị trí ngang tự do ở chế độ xem "2 chiều" (canvas), chưa đặt = chưa kéo lần nào
  canvasY?: number; // vị trí dọc tự do ở chế độ xem "2 chiều" (canvas)
  createdBy: string; // FK auth.users.id
  createdAt: string; // ISO timestamptz
  updatedAt: string; // ISO timestamptz
  // Gợi ý map khi mở card detail: labels?, checklistItems?, comments? (bonus).
}
