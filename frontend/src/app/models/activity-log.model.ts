// [BONUS #6] Log hoạt động dạng feed đơn giản (câu mô tả sẵn).
export interface ActivityLog {
  id: string; // uuid
  tenantId: string; // FK tenants.id
  boardId: string; // FK boards.id
  userId: string; // FK auth.users.id
  actionText: string; // vd: "Nam đã chuyển card 'Fix bug' sang Doing"
  createdAt: string; // ISO timestamptz
}
