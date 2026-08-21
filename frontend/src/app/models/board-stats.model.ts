// Số liệu cho modal "Thống kê & Báo cáo" của board.
//
// Khớp 3 view thống kê trong database.sql mục 12 (board_overview_stats,
// member_workload_stats, overdue_cards) — khi nối backend thật thì đây chính là
// hình dạng dữ liệu sẽ nhận về.

import { ActivityLog } from './activity-log.model';

/** Khối lượng công việc của từng thành viên.
 *  3 nhóm completed/doing/overdue KHÔNG chồng lấn, cộng lại = assignedCount. */
export interface MemberWorkloadStat {
  userId: string;
  name: string;
  avatarUrl: string;
  assignedCount: number;
  completedCount: number; // Done
  doingCount: number; // chưa xong & chưa quá hạn
  overdueCount: number; // dueDate đã qua và chưa hoàn thành
  lastActiveAt: string | null; // null = chưa từng có hoạt động nào
}

/** Một thẻ đã quá hạn — dùng cho ngăn kéo cảnh báo trong modal thống kê. */
export interface OverdueCardInfo {
  id: string;
  title: string;
  assigneeId: string;
  assigneeName: string;
  dueDate: string;
  daysOverdue: number;
}

/** 4 ô số liệu ở đầu modal thống kê. */
export interface WorkspaceStatsOverview {
  completedCount: number;
  inProgressCount: number; // chưa hoàn thành (To Do + Doing), gồm cả quá hạn
  overdueCount: number;
  onTimeRatePct: number | null;
}

/** Toàn bộ dữ liệu modal thống kê cần. */
export interface WorkspaceStatsData {
  workspaceName: string;
  overview: WorkspaceStatsOverview;
  memberWorkload: MemberWorkloadStat[];
  overdueCards: OverdueCardInfo[];
  activityLogs: ActivityLog[];
}
