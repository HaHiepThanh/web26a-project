// Người dùng (tương ứng bảng auth.users của Supabase + hồ sơ hiển thị).
// Lưu ý: DB dùng snake_case, ở frontend ta dùng camelCase khi map dữ liệu.
export interface User {
  id: string; // uuid
  email: string;
  displayName?: string; // tên hiển thị (settings #9)
  avatarUrl?: string; // ảnh đại diện
}
