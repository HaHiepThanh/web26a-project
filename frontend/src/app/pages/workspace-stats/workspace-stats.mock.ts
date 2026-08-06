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
 * Số liệu quá hạn / đúng hạn / thời gian xử lý được tính từ danh sách card giả
 * (MockStatsCard) thay vì gõ tay tổng số — dùng field `priority`/`completedAt`
 * mới thêm vào Card model, để khi nối API thật chỉ cần thay nguồn danh sách
 * card, các hàm compute* bên dưới giữ nguyên.
 */
import { ActivityLog, CardPriority } from '../../models';

interface MockStatsCard {
  id: string;
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
  completedCount: number;
  inProgressCount: number; // chưa hoàn thành (To Do + Doing)
  overdueCount: number; // dueDate đã qua và chưa hoàn thành
  lastActiveAt: string | null; // null = chưa từng có hoạt động nào
}

export interface PriorityBreakdownPoint {
  priority: CardPriority;
  count: number;
}

export interface DailyActivityPoint {
  date: string; // 'YYYY-MM-DD'
  count: number;
}

export interface WorkspaceStatsOverview {
  completedCount: number;
  inProgressCount: number;
  overdueCount: number;
  activeMemberCount: number;
  totalMemberCount: number;
  onTimeRatePct: number | null; // % card hoàn thành đúng hạn trong số card có dueDate — null nếu chưa có card nào đủ điều kiện so sánh
  avgCompletionDays: number | null; // số ngày trung bình từ lúc tạo đến lúc hoàn thành — null nếu chưa có card nào hoàn thành
}

export interface WorkspaceStatsData {
  workspaceName: string;
  overview: WorkspaceStatsOverview;
  dailyActivity: DailyActivityPoint[];
  memberWorkload: MemberWorkloadStat[];
  priorityBreakdown: PriorityBreakdownPoint[];
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

function completionDays(card: MockStatsCard): number | null {
  if (!card.completedAt) return null;
  const created = new Date(card.createdAt).getTime();
  const completed = new Date(card.completedAt).getTime();
  return Math.round((completed - created) / (1000 * 60 * 60 * 24));
}

function computeMemberWorkload(cards: MockStatsCard[], activityLogs: ActivityLog[]): MemberWorkloadStat[] {
  return MEMBERS.map(({ userId, name }) => {
    const mine = cards.filter((c) => c.assigneeId === userId);
    const lastLog = activityLogs
      .filter((log) => log.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return {
      userId,
      name,
      avatarUrl: avatar(userId),
      assignedCount: mine.length,
      completedCount: mine.filter((c) => c.listName === 'Done').length,
      inProgressCount: mine.filter((c) => c.listName !== 'Done').length,
      overdueCount: mine.filter(isOverdue).length,
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

  const completionTimes = cards.map(completionDays).filter((d): d is number => d !== null);
  const avgCompletionDays = completionTimes.length
    ? Math.round((completionTimes.reduce((sum, d) => sum + d, 0) / completionTimes.length) * 10) / 10
    : null;

  return {
    completedCount: memberWorkload.reduce((sum, m) => sum + m.completedCount, 0),
    inProgressCount: memberWorkload.reduce((sum, m) => sum + m.inProgressCount, 0),
    overdueCount: memberWorkload.reduce((sum, m) => sum + m.overdueCount, 0),
    activeMemberCount: memberWorkload.filter((m) => m.lastActiveAt !== null).length,
    totalMemberCount: memberWorkload.length,
    onTimeRatePct: doneWithDueDate.length ? Math.round((onTimeCount / doneWithDueDate.length) * 100) : null,
    avgCompletionDays,
  };
}

/** Bộ dữ liệu chính: nhiều thành viên, đủ các case (đúng hạn/trễ hạn/không có hạn/chưa xong). */
export function mockWorkspaceStats(): WorkspaceStatsData {
  const cards: MockStatsCard[] = [
    // Bạn (me)
    { id: 'c1', assigneeId: 'me', listName: 'Doing', priority: 'high', dueDate: dateDaysAgo(-2), createdAt: isoDaysAgo(10), completedAt: null },
    { id: 'c9', assigneeId: 'me', listName: 'To Do', priority: 'low', dueDate: dateDaysAgo(-1), createdAt: isoDaysAgo(0), completedAt: null },
    { id: 'c-done-me1', assigneeId: 'me', listName: 'Done', priority: 'medium', dueDate: dateDaysAgo(5), createdAt: isoDaysAgo(12), completedAt: isoDaysAgo(6) },

    // Nguyễn Minh Anh (u2)
    { id: 'c2', assigneeId: 'u2', listName: 'Doing', priority: 'medium', dueDate: dateDaysAgo(1), createdAt: isoDaysAgo(12), completedAt: null }, // quá hạn, chưa xong
    { id: 'c3', assigneeId: 'u2', listName: 'Doing', priority: 'high', dueDate: dateDaysAgo(-3), createdAt: isoDaysAgo(6), completedAt: null },
    { id: 'c-done-u2-1', assigneeId: 'u2', listName: 'Done', priority: 'low', dueDate: dateDaysAgo(5), createdAt: isoDaysAgo(15), completedAt: isoDaysAgo(6) }, // đúng hạn
    { id: 'c-done-u2-2', assigneeId: 'u2', listName: 'Done', priority: 'high', dueDate: dateDaysAgo(3), createdAt: isoDaysAgo(10), completedAt: isoDaysAgo(1) }, // trễ hạn
    { id: 'c-done-u2-3', assigneeId: 'u2', listName: 'Done', priority: 'medium', dueDate: dateDaysAgo(8), createdAt: isoDaysAgo(20), completedAt: isoDaysAgo(9) }, // đúng hạn

    // Trần Bảo Long (u3)
    { id: 'c4', assigneeId: 'u3', listName: 'Doing', priority: 'medium', dueDate: dateDaysAgo(-5), createdAt: isoDaysAgo(6), completedAt: null },
    { id: 'c-todo-u3', assigneeId: 'u3', listName: 'To Do', priority: 'high', dueDate: dateDaysAgo(2), createdAt: isoDaysAgo(9), completedAt: null }, // quá hạn, chưa bắt đầu
    { id: 'c-done-u3-1', assigneeId: 'u3', listName: 'Done', priority: 'medium', dueDate: null, createdAt: isoDaysAgo(8), completedAt: isoDaysAgo(2) }, // không có hạn
    { id: 'c-done-u3-2', assigneeId: 'u3', listName: 'Done', priority: 'low', dueDate: dateDaysAgo(1), createdAt: isoDaysAgo(7), completedAt: isoDaysAgo(2) }, // đúng hạn

    // Lê Thu Hà (u4) — không có card nào (case rỗng cho 1 thành viên)

    // Phạm Quốc Việt (u5)
    { id: 'c-active-u5', assigneeId: 'u5', listName: 'Doing', priority: 'low', dueDate: dateDaysAgo(-4), createdAt: isoDaysAgo(3), completedAt: null },
    { id: 'c-done-u5-1', assigneeId: 'u5', listName: 'Done', priority: 'medium', dueDate: dateDaysAgo(4), createdAt: isoDaysAgo(9), completedAt: isoDaysAgo(5) }, // đúng hạn
    { id: 'c-done-u5-2', assigneeId: 'u5', listName: 'Done', priority: 'low', dueDate: dateDaysAgo(2), createdAt: isoDaysAgo(6), completedAt: isoDaysAgo(3) }, // đúng hạn
  ];

  const activityLogs: ActivityLog[] = [
    { id: 'log-1', tenantId: 'tenant-1', boardId: 'b-1', userId: 'u2', actionType: 'card_created', targetId: 'c3', actionText: 'Nguyễn Minh Anh đã tạo card "Viết API xác thực người dùng"', createdAt: isoDaysAgo(6, 8) },
    { id: 'log-2', tenantId: 'tenant-1', boardId: 'b-1', userId: 'u3', actionType: 'card_created', targetId: 'c4', actionText: 'Trần Bảo Long đã tạo card "Thiết kế wireframe trang chủ"', createdAt: isoDaysAgo(6, 10) },
    { id: 'log-3', tenantId: 'tenant-1', boardId: 'b-1', userId: 'me', actionType: 'card_moved', targetId: 'c1', actionText: 'Bạn đã chuyển card "Thiết kế schema database" sang Doing', createdAt: isoDaysAgo(5, 9) },
    { id: 'log-4', tenantId: 'tenant-1', boardId: 'b-1', userId: 'u2', actionType: 'card_assigned', targetId: 'c2', actionText: 'Nguyễn Minh Anh đã giao card "Review pull request #482" cho chính mình', createdAt: isoDaysAgo(4, 11) },
    { id: 'log-5', tenantId: 'tenant-1', boardId: 'b-1', userId: 'u3', actionType: 'comment_added', targetId: 'c4', actionText: 'Trần Bảo Long đã bình luận vào "Thiết kế wireframe trang chủ"', createdAt: isoDaysAgo(4, 14) },
    { id: 'log-6', tenantId: 'tenant-1', boardId: 'b-1', userId: 'me', actionType: 'card_updated', targetId: 'c1', actionText: 'Bạn đã cập nhật mô tả card "Thiết kế schema database"', createdAt: isoDaysAgo(3, 9) },
    // ngày -2: không có hoạt động nào (test cột 0 trên biểu đồ)
    { id: 'log-7', tenantId: 'tenant-1', boardId: 'b-1', userId: 'u2', actionType: 'card_moved', targetId: 'c2', actionText: 'Nguyễn Minh Anh đã chuyển card "Review pull request #482" sang Doing', createdAt: isoDaysAgo(1, 15) },
    { id: 'log-8', tenantId: 'tenant-1', boardId: 'b-1', userId: 'u5', actionType: 'comment_added', targetId: 'c2', actionText: 'Phạm Quốc Việt đã bình luận vào "Review pull request #482"', createdAt: isoDaysAgo(1, 16) },
    { id: 'log-9', tenantId: 'tenant-1', boardId: 'b-1', userId: 'me', actionType: 'card_created', targetId: 'c9', actionText: 'Bạn đã tạo card "Chuẩn bị demo tuần này"', createdAt: isoDaysAgo(0, 8) },
    { id: 'log-10', tenantId: 'tenant-1', boardId: 'b-1', userId: 'u2', actionType: 'card_moved', targetId: 'c3', actionText: 'Nguyễn Minh Anh đã chuyển card "Viết API xác thực người dùng" sang Doing', createdAt: isoDaysAgo(0, 13) },
    // u3: hoạt động gần nhất đã 4 ngày trước -> case "không hoạt động lâu ngày" dù vẫn có việc đang làm
  ];

  const dailyActivity: DailyActivityPoint[] = Array.from({ length: 7 }, (_, i) => {
    const date = dateDaysAgo(6 - i); // cũ nhất trước
    const count = activityLogs.filter((log) => log.createdAt.slice(0, 10) === date).length;
    return { date, count };
  });

  const memberWorkload = computeMemberWorkload(cards, activityLogs);
  const priorityBreakdown = computePriorityBreakdown(cards);
  const overview = computeOverview(cards, memberWorkload);

  return { workspaceName: 'Đồ án Tốt nghiệp CNTT', overview, dailyActivity, memberWorkload, priorityBreakdown, activityLogs };
}

/** Case rỗng: workspace chỉ có 1 thành viên (chính mình), chưa ai làm gì. */
export function mockEmptyWorkspaceStats(): WorkspaceStatsData {
  const dailyActivity: DailyActivityPoint[] = Array.from({ length: 7 }, (_, i) => ({ date: dateDaysAgo(6 - i), count: 0 }));
  return {
    workspaceName: 'Workspace mới',
    overview: {
      completedCount: 0,
      inProgressCount: 0,
      overdueCount: 0,
      activeMemberCount: 0,
      totalMemberCount: 1,
      onTimeRatePct: null,
      avgCompletionDays: null,
    },
    dailyActivity,
    memberWorkload: [{ userId: 'me', name: 'Bạn', avatarUrl: avatar('me'), assignedCount: 0, completedCount: 0, inProgressCount: 0, overdueCount: 0, lastActiveAt: null }],
    priorityBreakdown: [
      { priority: 'high', count: 0 },
      { priority: 'medium', count: 0 },
      { priority: 'low', count: 0 },
    ],
    activityLogs: [],
  };
}

/** Case danh sách nhật ký hoạt động dài — test phân trang/scroll. */
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
