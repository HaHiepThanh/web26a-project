// [BONUS #6] Log hoạt động dạng feed đơn giản (câu mô tả sẵn).

// Loại hành động có cấu trúc — dùng để lọc/thống kê (trang Workspace Stats).
// actionText vẫn giữ để hiển thị nguyên câu, actionType chỉ dùng để phân loại/đếm.
export type ActivityActionType =
  | 'card_created'
  | 'card_moved'
  | 'card_updated'
  | 'card_deleted'
  | 'card_assigned'
  | 'comment_added';

export interface ActivityLog {
  id: string; // uuid
  orgId: string; // FK organizations.id
  boardId: string; // FK boards.id
  cardId?: string; // cột mới (CLAUDE.md #11) — lọc audit trail theo đúng 1 thẻ, xem migrations/0002_*.sql
  userId: string; // FK auth.users.id
  actionType: ActivityActionType;
  targetId?: string; // FK cards.id (hoặc list/comment...), nullable
  actionText: string; // vd: "Nam đã chuyển card 'Fix bug' sang Doing"
  createdAt: string; // ISO timestamptz
  user?: { displayName: string | null; avatarUrl: string | null } | null;
}
