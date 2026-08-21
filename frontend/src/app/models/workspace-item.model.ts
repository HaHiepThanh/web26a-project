// Kiểu HIỂN THỊ của trang Workspace — khác `Workspace` trong workspace.model.ts.
//
// `Workspace` là bản ghi trong database (id, orgId, name, createdAt).
// `WorkspaceItem` là thứ trang Workspace vẽ ra: có sẵn danh sách board bên trong,
// số thành viên, mô tả... Giữ riêng để đổi giao diện không phải đụng vào model DB.

import { BoardBackground } from './board.model';

/** Mức riêng tư hiển thị trên giao diện. Khớp 1-1 với `BoardVisibility` của backend
 *  (`Workspace`→`workspace`, `Private`→`private`, `Public`→`public`). */
export type Privacy = 'Workspace' | 'Private' | 'Public';

export interface WorkspaceMember {
  id: string;
  displayName: string;
  email: string;
  role: 'owner' | 'member';
  avatarUrl?: string;
}

export interface BoardItem {
  id: string;
  title: string;
  tag: string;
  privacy: Privacy;
  badge: string;
  starred: boolean;
  bgClass: BoardBackground;
  // Ảnh nền KHÔNG lưu ở đây: base64 rất nặng, giữ 1 bản duy nhất trong BoardService
  // (key `trello_boards`) và tra theo board.id — xem `backgroundImageByBoardId`.
}

export interface WorkspaceItem {
  id: string;
  name: string;
  // Không có icon/màu: Workspace chỉ hiện bằng TÊN. Màu chỉ dành cho Board (Kanban).
  membersCount: number;
  members: WorkspaceMember[];
  description: string;
  boards: BoardItem[];
}

/** Workspace kèm tên tổ chức chứa nó — dùng ở trang Cài đặt khi liệt kê gộp
 *  workspace của mọi tổ chức, để phân biệt hai workspace trùng tên. */
export interface WorkspaceWithOrg extends WorkspaceItem {
  orgId: string;
  orgName: string;
}

/** Mẫu board dựng sẵn cho người dùng chọn nhanh khi tạo board mới. */
export interface Template {
  title: string;
  desc: string;
  badge: string;
  badgeClass: string;
  columns: number;
}

/** Board vừa xoá, giữ tạm để bấm "Hoàn tác" trong toast. */
export interface TrashedBoard {
  board: BoardItem;
  workspaceId: string;
  workspaceName: string;
  originalIndex: number;
}
