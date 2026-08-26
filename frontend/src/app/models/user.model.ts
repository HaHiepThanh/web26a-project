// Người dùng (tương ứng bảng auth.users của Supabase + hồ sơ hiển thị).
// Lưu ý: DB dùng snake_case, ở frontend ta dùng camelCase khi map dữ liệu.
import type { OnboardingState } from './onboarding.model';

export interface User {
  id: string; // uuid
  email: string;
  displayName?: string; // tên hiển thị
  username?: string; // tên đăng nhập
  phone?: string; // số điện thoại
  jobTitle?: string; // chức vụ/tiêu đề công việc
  // KHÔNG có `password` ở đây. Firebase giữ mật khẩu (băm scrypt + salt riêng
  // từng user), ứng dụng không bao giờ cầm bản rõ. Trường này từng tồn tại từ
  // thời dữ liệu giả và đã gây một lỗi thật: trang Cài đặt so mật khẩu hiện tại
  // với nó (tài khoản thật luôn undefined nên phép so bị bỏ qua), rồi ghi mật
  // khẩu mới vào đây — tức vào localStorage dưới dạng bản rõ — và báo "đổi
  // thành công" trong khi Firebase không hề đổi.
  avatarUrl?: string; // ảnh đại diện
  /**
   * Trạng thái tour hướng dẫn — nguồn sự thật là cột `users.onboarding_state`.
   *
   * Có mặt ở đây vì `User` là thứ được cache xuống localStorage giữa các lần tải
   * trang; thiếu nó thì mỗi lần F5 tour lại tưởng người dùng chưa từng chạy và
   * chào lại, cho tới khi `/auth/me` trả về. Xem models/onboarding.model.ts.
   */
  onboardingState?: OnboardingState;
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


