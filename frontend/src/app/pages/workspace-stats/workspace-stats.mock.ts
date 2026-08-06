/**
 * Types & mock data for the "Workspace Stats" page.
 *
 * Kept colocated in this feature folder (not in the shared `models/` barrel),
 * same pattern as `pages/settings/manage-workspace`: this feature is
 * frontend-only / mock-backed until `cards.service.ts` (backend) returns real
 * data. Whoever wires the real API later replaces the mock*() functions below
 * without touching any shared file outside this folder.
 *
 * `activityLogs` here already matches the real `ActivityLog` shape
 * (see models/activity-log.model.ts + backend activity.service.ts), so that
 * block can be swapped for a real `ActivityService.loadLogs()` call first,
 * independently of the other mock sections.
 *
 * Mọi số liệu (quá hạn, đúng hạn, phân bổ ưu tiên, biểu đồ theo ngày, thanh
 * trạng thái từng thành viên) đều được TÍNH từ một danh sách card giả
 * (MockStatsCard) dùng field `priority`/`completedAt` mới thêm vào Card model
 * — không có số nào gõ tay — nên khi nối API thật chỉ cần thay nguồn card,
 * các hàm compute* bên dưới giữ nguyên.
 */
import { ActivityLog, CardPriority } from '../../models';

interface MockStatsCard {
  id: string;
  title: string;
  assigneeId: string;
  listName: 'To Do' | 'Doing' | 'Done';
  priority: CardPriority;
  dueDate: string | null; // 'YYYY-MM-DD'
  createdAt: string; // ISO
  completedAt: string | null; // ISO — chỉ có khi listName === 'Done'
}

export interface MemberWorkloadStat {
  userId: string;
  name: string;
  avatarUrl: string;
  assignedCount: number;
  completedCount: number; // Done
  doingCount: number; // chưa xong & chưa quá hạn (To Do + Doing, không tính overdue)
  overdueCount: number; // dueDate đã qua và chưa hoàn thành
  lastActiveAt: string | null; // null = chưa từng có hoạt động nào
}

export interface PriorityBreakdownPoint {
  priority: CardPriority;
  count: number;
}

export interface DailyBreakdownPoint {
  date: string; // 'YYYY-MM-DD'
  createdCount: number; // task mới tạo trong ngày
  completedCount: number; // task hoàn thành trong ngày
}

export interface OverdueCardInfo {
  id: string;
  title: string;
  assigneeId: string;
  assigneeName: string;
  dueDate: string;
  daysOverdue: number;
}

export interface WorkspaceStatsOverview {
  completedCount: number;
  inProgressCount: number; // chưa hoàn thành (To Do + Doing), gồm cả quá hạn
  overdueCount: number;
  onTimeRatePct: number | null; // % card hoàn thành đúng hạn trong số card có dueDate — null nếu chưa có card nào đủ điều kiện so sánh
}

export interface WorkspaceStatsData {
  workspaceName: string;
  overview: WorkspaceStatsOverview;
  dailyActivity: DailyBreakdownPoint[];
  memberWorkload: MemberWorkloadStat[];
  priorityBreakdown: PriorityBreakdownPoint[];
  overdueCards: OverdueCardInfo[];
  activityLogs: ActivityLog[];
}

const MEMBERS = [
  { userId: 'me', name: 'Bạn' },
  { userId: 'u2', name: 'Nguyễn Minh Anh' },
  { userId: 'u3', name: 'Trần Bảo Long' },
  { userId: 'u4', name: 'Lê Thu Hà' },
  { userId: 'u5', name: 'Phạm Quốc Việt' },
];

function avatar(seed: string): string {
  return `https://i.pravatar.cc/100?u=${encodeURIComponent(seed)}`;
}

function isoDaysAgo(n: number, hour = 9): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

function dateDaysAgo(n: number): string {
  return isoDaysAgo(n).slice(0, 10);
}

const TODAY = dateDaysAgo(0);

function isOverdue(card: MockStatsCard): boolean {
  return card.listName !== 'Done' && card.dueDate !== null && card.dueDate < TODAY;
}

function daysBetween(fromDate: string, toDate: string): number {
  const ms = new Date(toDate).getTime() - new Date(fromDate).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function computeMemberWorkload(cards: MockStatsCard[], activityLogs: ActivityLog[]): MemberWorkloadStat[] {
  return MEMBERS.map(({ userId, name }) => {
    const mine = cards.filter((c) => c.assigneeId === userId);
    const overdueCount = mine.filter(isOverdue).length;
    const lastLog = activityLogs
      .filter((log) => log.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return {
      userId,
      name,
      avatarUrl: avatar(userId),
      assignedCount: mine.length,
      completedCount: mine.filter((c) => c.listName === 'Done').length,
      doingCount: mine.filter((c) => c.listName !== 'Done').length - overdueCount,
      overdueCount,
      lastActiveAt: lastLog?.createdAt ?? null,
    };
  });
}

function computePriorityBreakdown(cards: MockStatsCard[]): PriorityBreakdownPoint[] {
  const priorities: CardPriority[] = ['high', 'medium', 'low'];
  return priorities.map((priority) => ({ priority, count: cards.filter((c) => c.priority === priority).length }));
}

function computeOverview(cards: MockStatsCard[], memberWorkload: MemberWorkloadStat[]): WorkspaceStatsOverview {
  const doneWithDueDate = cards.filter((c) => c.listName === 'Done' && c.dueDate !== null);
  const onTimeCount = doneWithDueDate.filter((c) => (c.completedAt as string).slice(0, 10) <= (c.dueDate as string)).length;

  return {
    completedCount: memberWorkload.reduce((sum, m) => sum + m.completedCount, 0),
    inProgressCount: memberWorkload.reduce((sum, m) => sum + m.doingCount + m.overdueCount, 0),
    overdueCount: memberWorkload.reduce((sum, m) => sum + m.overdueCount, 0),
    onTimeRatePct: doneWithDueDate.length ? Math.round((onTimeCount / doneWithDueDate.length) * 100) : null,
  };
}

function computeOverdueCards(cards: MockStatsCard[]): OverdueCardInfo[] {
  return cards
    .filter(isOverdue)
    .map((c) => ({
      id: c.id,
      title: c.title,
      assigneeId: c.assigneeId,
      assigneeName: MEMBERS.find((m) => m.userId === c.assigneeId)?.name ?? c.assigneeId,
      dueDate: c.dueDate as string,
      daysOverdue: daysBetween(c.dueDate as string, TODAY),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

function computeDailyBreakdown(cards: MockStatsCard[], days: number): DailyBreakdownPoint[] {
  return Array.from({ length: days }, (_, i) => {
    const date = dateDaysAgo(days - 1 - i); // cũ nhất trước
    return {
      date,
      createdCount: cards.filter((c) => c.createdAt.slice(0, 10) === date).length,
      completedCount: cards.filter((c) => c.completedAt?.slice(0, 10) === date).length,
    };
  });
}

/** Bộ dữ liệu chính: nhiều thành viên, đủ các case (đúng hạn/trễ hạn/không có hạn/chưa xong). */
export function mockWorkspaceStats(): WorkspaceStatsData {
  const cards: MockStatsCard[] = [
    // Bạn (me)
    { id: 'c1', title: 'Thiết kế schema database', assigneeId: 'me', listName: 'Doing', priority: 'high', dueDate: dateDaysAgo(-2), createdAt: isoDaysAgo(6), completedAt: null },
    { id: 'c9', title: 'Chuẩn bị demo tuần này', assigneeId: 'me', listName: 'To Do', priority: 'low', dueDate: dateDaysAgo(-1), createdAt: isoDaysAgo(0), completedAt: null },
    { id: 'c-done-me1', title: 'Viết tài liệu yêu cầu', assigneeId: 'me', listName: 'Done', priority: 'medium', dueDate: dateDaysAgo(1), createdAt: isoDaysAgo(6), completedAt: isoDaysAgo(1) }, // đúng hạn

    // Nguyễn Minh Anh (u2)
    { id: 'c2', title: 'Review pull request #482', assigneeId: 'u2', listName: 'Doing', priority: 'medium', dueDate: dateDaysAgo(1), createdAt: isoDaysAgo(8), completedAt: null }, // quá hạn 1 ngày
    { id: 'c3', title: 'Viết API xác thực người dùng', assigneeId: 'u2', listName: 'Doing', priority: 'high', dueDate: dateDaysAgo(-3), createdAt: isoDaysAgo(5), completedAt: null },
    { id: 'c-done-u2-1', title: 'Cập nhật tài liệu hướng dẫn cài đặt', assigneeId: 'u2', listName: 'Done', priority: 'low', dueDate: dateDaysAgo(3), createdAt: isoDaysAgo(7), completedAt: isoDaysAgo(4) }, // đúng hạn
    { id: 'c-done-u2-2', title: 'Fix lỗi đăng nhập Google', assigneeId: 'u2', listName: 'Done', priority: 'high', dueDate: dateDaysAgo(2), createdAt: isoDaysAgo(5), completedAt: isoDaysAgo(0) }, // trễ hạn
    { id: 'c-done-u2-3', title: 'Setup CI pipeline cho backend', assigneeId: 'u2', listName: 'Done', priority: 'medium', dueDate: dateDaysAgo(1), createdAt: isoDaysAgo(4), completedAt: isoDaysAgo(2) }, // đúng hạn

    // Trần Bảo Long (u3)
    { id: 'c4', title: 'Thiết kế wireframe trang chủ', assigneeId: 'u3', listName: 'Doing', priority: 'medium', dueDate: dateDaysAgo(-5), createdAt: isoDaysAgo(6), completedAt: null },
    { id: 'c-todo-u3', title: 'Fix lỗi hiển thị trên mobile', assigneeId: 'u3', listName: 'To Do', priority: 'high', dueDate: dateDaysAgo(2), createdAt: isoDaysAgo(3), completedAt: null }, // quá hạn 2 ngày, chưa bắt đầu
    { id: 'c-done-u3-1', title: 'Viết test cho module thanh toán', assigneeId: 'u3', listName: 'Done', priority: 'medium', dueDate: null, createdAt: isoDaysAgo(5), completedAt: isoDaysAgo(2) }, // không có hạn
    { id: 'c-done-u3-2', title: 'Refactor component Header', assigneeId: 'u3', listName: 'Done', priority: 'low', dueDate: dateDaysAgo(1), createdAt: isoDaysAgo(4), completedAt: isoDaysAgo(1) }, // đúng hạn

    // Lê Thu Hà (u4) — không có card nào (case rỗng cho 1 thành viên)

    // Phạm Quốc Việt (u5)
    { id: 'c-active-u5', title: 'Tích hợp bản đồ Google Maps', assigneeId: 'u5', listName: 'Doing', priority: 'low', dueDate: dateDaysAgo(-4), createdAt: isoDaysAgo(3), completedAt: null },
    { id: 'c-done-u5-1', title: 'Viết báo cáo tuần', assigneeId: 'u5', listName: 'Done', priority: 'medium', dueDate: dateDaysAgo(1), createdAt: isoDaysAgo(3), completedAt: isoDaysAgo(2) }, // đúng hạn
    { id: 'c-done-u5-2', title: 'Chuẩn bị slide thuyết trình', assigneeId: 'u5', listName: 'Done', priority: 'low', dueDate: dateDaysAgo(0), createdAt: isoDaysAgo(2), completedAt: isoDaysAgo(1) }, // đúng hạn
  ];

  const activityLogs: ActivityLog[] = [
    { id: 'log-1', tenantId: 'tenant-1', boardId: 'b-1', userId: 'u2', actionType: 'card_created', targetId: 'c3', actionText: 'Nguyễn Minh Anh đã tạo card "Viết API xác thực người dùng"', createdAt: isoDaysAgo(6, 8) },
    { id: 'log-2', tenantId: 'tenant-1', boardId: 'b-1', userId: 'u3', actionType: 'card_created', targetId: 'c4', actionText: 'Trần Bảo Long đã tạo card "Thiết kế wireframe trang chủ"', createdAt: isoDaysAgo(6, 10) },
    { id: 'log-3', tenantId: 'tenant-1', boardId: 'b-1', userId: 'me', actionType: 'card_moved', targetId: 'c1', actionText: 'Bạn đã chuyển card "Thiết kế schema database" sang Doing', createdAt: isoDaysAgo(5, 9) },
    { id: 'log-4', tenantId: 'tenant-1', boardId: 'b-1', userId: 'u2', actionType: 'card_assigned', targetId: 'c2', actionText: 'Nguyễn Minh Anh đã giao card "Review pull request #482" cho chính mình', createdAt: isoDaysAgo(4, 11) },
    { id: 'log-5', tenantId: 'tenant-1', boardId: 'b-1', userId: 'u3', actionType: 'comment_added', targetId: 'c4', actionText: 'Trần Bảo Long đã bình luận vào "Thiết kế wireframe trang chủ"', createdAt: isoDaysAgo(4, 14) },
    { id: 'log-6', tenantId: 'tenant-1', boardId: 'b-1', userId: 'me', actionType: 'card_updated', targetId: 'c1', actionText: 'Bạn đã cập nhật mô tả card "Thiết kế schema database"', createdAt: isoDaysAgo(3, 9) },
    { id: 'log-7', tenantId: 'tenant-1', boardId: 'b-1', userId: 'u5', actionType: 'card_created', targetId: 'c-active-u5', actionText: 'Phạm Quốc Việt đã tạo card "Tích hợp bản đồ Google Maps"', createdAt: isoDaysAgo(3, 10) },
    { id: 'log-8', tenantId: 'tenant-1', boardId: 'b-1', userId: 'u3', actionType: 'card_deleted', targetId: 'c-old', actionText: 'Trần Bảo Long đã xoá card "Nháp cũ không dùng"', createdAt: isoDaysAgo(2, 11) },
    { id: 'log-9', tenantId: 'tenant-1', boardId: 'b-1', userId: 'u2', actionType: 'card_moved', targetId: 'c-done-u2-3', actionText: 'Nguyễn Minh Anh đã chuyển card "Setup CI pipeline cho backend" sang Done', createdAt: isoDaysAgo(2, 15) },
    { id: 'log-10', tenantId: 'tenant-1', boardId: 'b-1', userId: 'u5', actionType: 'comment_added', targetId: 'c2', actionText: 'Phạm Quốc Việt đã bình luận vào "Review pull request #482"', createdAt: isoDaysAgo(1, 16) },
    { id: 'log-11', tenantId: 'tenant-1', boardId: 'b-1', userId: 'me', actionType: 'card_created', targetId: 'c9', actionText: 'Bạn đã tạo card "Chuẩn bị demo tuần này"', createdAt: isoDaysAgo(0, 8) },
    { id: 'log-12', tenantId: 'tenant-1', boardId: 'b-1', userId: 'u2', actionType: 'card_updated', targetId: 'c-done-u2-2', actionText: 'Nguyễn Minh Anh đã cập nhật card "Fix lỗi đăng nhập Google"', createdAt: isoDaysAgo(0, 13) },
    // u3: hoạt động gần nhất đã 2 ngày trước, u4 chưa từng hoạt động -> case "không hoạt động lâu ngày"
  ];

  const dailyActivity = computeDailyBreakdown(cards, 7);
  const memberWorkload = computeMemberWorkload(cards, activityLogs);
  const priorityBreakdown = computePriorityBreakdown(cards);
  const overview = computeOverview(cards, memberWorkload);
  const overdueCards = computeOverdueCards(cards);

  return { workspaceName: 'Đồ án Tốt nghiệp CNTT', overview, dailyActivity, memberWorkload, priorityBreakdown, overdueCards, activityLogs };
}

/** Case rỗng: workspace chỉ có 1 thành viên (chính mình), chưa ai làm gì. */
export function mockEmptyWorkspaceStats(): WorkspaceStatsData {
  const dailyActivity: DailyBreakdownPoint[] = Array.from({ length: 7 }, (_, i) => ({ date: dateDaysAgo(6 - i), createdCount: 0, completedCount: 0 }));
  return {
    workspaceName: 'Workspace mới',
    overview: { completedCount: 0, inProgressCount: 0, overdueCount: 0, onTimeRatePct: null },
    dailyActivity,
    memberWorkload: [{ userId: 'me', name: 'Bạn', avatarUrl: avatar('me'), assignedCount: 0, completedCount: 0, doingCount: 0, overdueCount: 0, lastActiveAt: null }],
    priorityBreakdown: [
      { priority: 'high', count: 0 },
      { priority: 'medium', count: 0 },
      { priority: 'low', count: 0 },
    ],
    overdueCards: [],
    activityLogs: [],
  };
}

/** Case danh sách nhật ký hoạt động dài — test phân trang/scroll/tìm kiếm. */
export function mockLongActivityLog(): ActivityLog[] {
  const actionTypes: ActivityLog['actionType'][] = ['card_created', 'card_moved', 'card_updated', 'card_deleted', 'card_assigned', 'comment_added'];
  const authors = ['me', 'u2', 'u3', 'u5'];
  return Array.from({ length: 80 }, (_, i) => {
    const actionType = actionTypes[i % actionTypes.length];
    const userId = authors[i % authors.length];
    return {
      id: `log-long-${i}`,
      tenantId: 'tenant-1',
      boardId: 'b-1',
      userId,
      actionType,
      targetId: `c${i}`,
      actionText: `Hoạt động thử #${80 - i} (${actionType})`,
      createdAt: isoDaysAgo(Math.floor(i / 12), 8 + (i % 10)),
    };
  });
}
