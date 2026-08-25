import type { User } from '../../models';

/**
 * Một người có quyền xem board, kèm sẵn thông tin hiển thị.
 *
 * `user` có thể null: `GET /boards/:id/members` join sang bảng `users`, dòng nào
 * hỏng join thì backend trả `user: null` chứ không bỏ luôn dòng đó. Giữ nguyên
 * `userId` để vẫn gỡ được người ấy khỏi board.
 */
export interface BoardMemberView {
  userId: string;
  user: User | null;
}

export interface ManageWorkspaceState {
  /**
   * Thành viên từng board, khoá theo boardId.
   *
   * ⚠️ Cố ý KHÔNG dùng `withEntities`. Đây là dữ liệu bảng nối (board × user),
   *    không có khoá chính một cột để làm entity id — giống hệt `cardLabelIds`
   *    trong `LabelStore`. Nhét vào `withEntities` thì phải bịa id ghép
   *    `${boardId}:${userId}`, vừa khó xoá theo board vừa chẳng được lợi gì.
   */
  membersByBoard: Record<string, BoardMemberView[]>;

  /**
   * Board đã gọi API xong.
   *
   * Cần riêng một Set vì `membersByBoard[id]` rỗng KHÔNG phân biệt được "nạp rồi,
   * board này đúng là không có ai" với "chưa nạp bao giờ" — hai cái đó phải hiện
   * hai màn hình khác nhau (danh sách trống vs. vòng quay chờ).
   */
  loadedBoardIds: ReadonlySet<string>;
}

export const initialManageWorkspaceState: ManageWorkspaceState = {
  membersByBoard: {},
  loadedBoardIds: new Set<string>(),
};
