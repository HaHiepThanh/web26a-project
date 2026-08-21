import { User } from './user.model';

// Vai trò trong tổ chức — khớp CHECK của cột organization_members.role trong DB.
//   owner  — chủ tổ chức, làm được mọi thứ (mỗi tổ chức chỉ có ĐÚNG 1 owner)
//   admin  — được uỷ quyền: mời/xoá thành viên, tạo/xoá workspace & board
//   member — thành viên thường
export type Role = 'owner' | 'admin' | 'member';

// Thành viên thuộc một tổ chức + vai trò (#2).
export interface OrganizationMember {
  id: string; // uuid
  orgId: string; // FK organizations.id
  userId: string; // FK users.id (Firebase uid)
  role: Role;
  joinedAt: string; // ISO timestamptz
  // Gợi ý: khi hiển thị danh sách thành viên, join thêm thông tin User (tên, email).
  user?: import('./user.model').User;
}

/** Thành viên tổ chức đã kèm sẵn thông tin hiển thị (tên, email, ảnh) lấy từ
 *  `GET /organizations/:id/members` — component dùng thẳng, không phải dò lại user. */
export interface OrgMemberView {
  user: User;
  role: Role;
  joinedAt: string;
}
