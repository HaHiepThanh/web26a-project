// Loại hành động có cấu trúc — dùng để lọc/thống kê (trang Workspace Stats).
// Phải khớp với frontend/src/app/models/activity-log.model.ts.
export type ActivityActionType =
  | 'card_created'
  | 'card_moved'
  | 'card_updated'
  | 'card_deleted'
  | 'card_assigned'
  | 'comment_added';

export interface ActivityLogRecord {
  id: string;
  orgId: string;
  boardId: string;
  userId: string;
  actionType: ActivityActionType;
  targetId?: string;
  actionText: string;
  createdAt: string; // ISO timestamptz
}
