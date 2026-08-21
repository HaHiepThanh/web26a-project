// Thông báo nổi góc màn hình (toast).
//
// Trước đây kiểu này được khai lại ở 6 nơi khác nhau (trang Board, Đăng nhập,
// Đăng ký, Workspace, Thành viên dự án, và mocks/workspace.mock.ts) — sửa một
// chỗ thì 5 chỗ kia lệch đi mà TypeScript không hề báo.
export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  /** Nút phụ trong toast, vd "Hoàn tác" sau khi xoá. Không có thì toast chỉ để đọc. */
  action?: { label: string; handler: () => void };
}
