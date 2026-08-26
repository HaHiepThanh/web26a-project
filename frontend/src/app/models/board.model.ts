// Board thuộc một workspace (#3).
//
// 3 giá trị này khớp ĐÚNG với CHECK constraint của cột `boards.visibility` trong
// database.sql và với DTO của backend. Gửi giá trị khác là backend trả 400.
//   'workspace' — mọi thành viên workspace xem được (mặc định)
//   'private'   — chỉ người có tên trong board_members
//   'public'    — ai trong tổ chức cũng xem được
export type BoardVisibility = 'workspace' | 'private' | 'public';

/** Màu nền trang Board — CSS class định nghĩa trong styles.css (global, không phải
 *  view-encapsulated, vì cùng 1 class được dùng ở cả tile Workspace lẫn trang Board). */
export type BoardBackground = 'bg-board-blue' | 'bg-board-purple' | 'bg-board-green' | 'bg-board-teal' | 'bg-board-orange' | 'bg-board-red';
export const BOARD_BACKGROUNDS: BoardBackground[] = ['bg-board-blue', 'bg-board-purple', 'bg-board-green', 'bg-board-teal', 'bg-board-orange', 'bg-board-red'];

export interface Board {
  id: string; // uuid
  orgId: string; // FK organizations.id
  workspaceId: string; // FK workspaces.id
  name: string;
  visibility: BoardVisibility; // default 'public'
  /** Chọn lúc tạo board (Workspace) — để trang Board + các danh sách nổi bật hơn thay
   *  vì chìm vào nền xám mặc định. undefined = giữ nền mặc định (các board demo cũ). */
  background?: BoardBackground;
  /** Ảnh nền tuỳ chọn (base64, demo lưu tại chỗ như AttachmentService) — có thì ưu tiên
   *  hiển thị thay cho `background` (màu có sẵn). */
  backgroundImageUrl?: string;
  /** Link Google Meet dùng chung cho board. Chưa ai mở họp thì không có. */
  meetUrl?: string;
  /** uid người đã mở cuộc họp. */
  meetCreatedBy?: string;
  createdBy: string; // FK auth.users.id
  createdAt: string; // ISO timestamptz
}

// Thành viên được phép xem board khi visibility = 'private' (#3, bonus).
export interface BoardMember {
  boardId: string; // FK boards.id
  userId: string; // FK auth.users.id
}

/** Kết quả tìm kiếm board từ API `GET /boards/search?q=...` */
export interface BoardSearchResult {
  id: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  orgId: string;
  orgSlug: string;
  visibility: BoardVisibility;
  background: string | null;
}
