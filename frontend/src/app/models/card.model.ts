// Card = thẻ công việc trong một list (#4).
export interface Card {
  id: string; // uuid
  tenantId: string; // FK tenants.id
  listId: string; // FK lists.id
  title: string;
  description?: string; // nullable, hỗ trợ markdown đơn giản
  assigneeId?: string; // FK auth.users.id, nullable — người phụ trách
  dueDate?: string; // nullable, dạng 'YYYY-MM-DD'
  position: number; // float — thứ tự trong list
  createdBy: string; // FK auth.users.id
  createdAt: string; // ISO timestamptz
  updatedAt: string; // ISO timestamptz
  // Gợi ý map khi mở card detail: labels?, checklistItems?, comments? (bonus).
}
