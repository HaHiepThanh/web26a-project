// Người dùng (tương ứng bảng auth.users của Supabase + hồ sơ hiển thị).
// Lưu ý: DB dùng snake_case, ở frontend ta dùng camelCase khi map dữ liệu.
export interface User {
  id: string; // uuid
  email: string;
  displayName?: string; // tên hiển thị
  username?: string; // tên đăng nhập
  phone?: string; // số điện thoại
  jobTitle?: string; // chức vụ/tiêu đề công việc
  password?: string; // mật khẩu tài khoản
  avatarUrl?: string; // ảnh đại diện
}

/** Tạo UUID v4 chuẩn */
export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export { MOCK_SEARCHABLE_USERS } from '../mocks/user.mock';


