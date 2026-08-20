import { ActivityLogRecord } from './activity.types';

/**
 * Dữ liệu giả cho activity_logs — dùng tạm trong lúc chưa nối bảng Supabase thật,
 * để FE (board activity-feed + trang Workspace Stats) có dữ liệu test ngay.
 * ids trùng với mock của "Manage Workspace Members"
 * (frontend/src/app/pages/settings/manage-workspace) để dữ liệu nhất quán giữa các trang.
 */
const ORG_ID = 'org-1';

function daysAgo(n: number, hour = 9): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

let seq = 0;
function log(
  boardId: string,
  userId: string,
  actionType: ActivityLogRecord['actionType'],
  actionText: string,
  createdAt: string,
  targetId?: string,
): ActivityLogRecord {
  seq += 1;
  return { id: `log-mock-${seq}`, orgId: ORG_ID, boardId, userId, actionType, targetId, actionText, createdAt };
}

/** b-1 có nhiều hoạt động trải nhiều ngày/nhiều thành viên (case thường gặp).
 *  b-2 chỉ có 1 hoạt động (case ít dữ liệu).
 *  b-3 không có hoạt động nào (case rỗng — không xuất hiện trong mảng bên dưới). */
export function createMockActivityLogs(): ActivityLogRecord[] {
  return [
    log('b-1', 'u2', 'card_created', 'Nguyễn Minh Anh đã tạo card "Viết API xác thực người dùng"', daysAgo(6, 8), 'c3'),
    log('b-1', 'u3', 'card_created', 'Trần Bảo Long đã tạo card "Thiết kế wireframe trang chủ"', daysAgo(6, 10), 'c4'),
    log('b-1', 'me', 'card_moved', 'Bạn đã chuyển card "Thiết kế schema database" sang Doing', daysAgo(5, 9), 'c1'),
    log('b-1', 'u2', 'card_assigned', 'Nguyễn Minh Anh đã giao card "Review pull request #482" cho chính mình', daysAgo(4, 11), 'c2'),
    log('b-1', 'u3', 'comment_added', 'Trần Bảo Long đã bình luận vào "Thiết kế wireframe trang chủ"', daysAgo(4, 14), 'c4'),
    log('b-1', 'me', 'card_updated', 'Bạn đã cập nhật mô tả card "Thiết kế schema database"', daysAgo(3, 9), 'c1'),
    log('b-1', 'u2', 'card_moved', 'Nguyễn Minh Anh đã chuyển card "Review pull request #482" sang Doing', daysAgo(2, 15), 'c2'),
    log('b-1', 'u5', 'comment_added', 'Phạm Quốc Việt đã bình luận vào "Review pull request #482"', daysAgo(2, 16), 'c2'),
    log('b-1', 'u3', 'card_deleted', 'Trần Bảo Long đã xoá card "Nháp cũ không dùng"', daysAgo(1, 9), 'c-old'),
    log('b-1', 'me', 'card_created', 'Bạn đã tạo card "Chuẩn bị demo tuần này"', daysAgo(0, 8), 'c9'),
    log('b-1', 'u2', 'card_moved', 'Nguyễn Minh Anh đã chuyển card "Viết API xác thực người dùng" sang Doing', daysAgo(0, 13), 'c3'),

    log('b-2', 'u6', 'card_created', 'Hoàng Nam đã tạo card "Tích hợp bản đồ Google Maps"', daysAgo(3, 10), 'c5'),
  ];
}
