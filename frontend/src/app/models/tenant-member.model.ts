// Vai trò trong tenant (#7): owner (toàn quyền) hoặc member.
export type Role = 'owner' | 'member';

// Thành viên thuộc một tenant + role (#2).
export interface TenantMember {
  id: string; // uuid
  tenantId: string; // FK tenants.id
  userId: string; // FK auth.users.id
  role: Role;
  joinedAt: string; // ISO timestamptz
  // Gợi ý: khi hiển thị danh sách thành viên, join thêm thông tin User (tên, email).
  user?: import('./user.model').User;
}
