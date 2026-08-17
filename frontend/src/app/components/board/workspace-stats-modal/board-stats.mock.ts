/**
 * Dữ liệu + kiểu dữ liệu mock cho Modal "Thống kê & Báo cáo" mở từ toolbar Board
 * (board.html/board.ts) — số liệu tính THEO ĐÚNG 1 BOARD đang xem, thẳng từ bộ card
 * seed của board đó (mock-board-data.ts, cùng nguồn đang render lên các cột/thẻ trên
 * board) nên luôn khớp với những gì người dùng đang thấy.
 *
 * Toàn bộ tính toán chạy phía trình duyệt, không gọi ApiService/backend nào cả — createdAt/
 * completedAt là suy ra CÓ CHỦ ĐÍCH (hash theo id thẻ, không dùng Math.random) để số liệu
 * ổn định giữa các lần mở modal, không đổi lung tung mỗi lần render lại.
 */
import { ActivityLog, CardPriority } from '../../../models';
import { boardSeed } from '../../../services/mock-board-data';
import { MOCK_MEMBERS } from '../../../services/board.service';

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
  onTimeRatePct: number | null;
}

export interface WorkspaceStatsData {
  workspaceName: string;
  overview: WorkspaceStatsOverview;
  memberWorkload: MemberWorkloadStat[];
  overdueCards: OverdueCardInfo[];
  activityLogs: ActivityLog[];
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
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
const NOW_MS = Date.now();

interface EnrichedCard {
  id: string;
  title: string;
  assigneeId: string;
  priority: CardPriority;
  dueDate: string | null;
  createdAt: string; // ISO
  completedAt: string | null; // ISO — có giá trị khi thẻ nằm ở cột cuối (coi là "Done")
  isDone: boolean;
}

/** Ngày hoàn thành suy ra quanh mốc hạn chót: ~1/3 số thẻ trễ hạn, còn lại đúng/sớm hạn
 *  — để "Tỷ lệ đúng hạn" không phải lúc nào cũng 100%, giống dữ liệu thật hơn. */
function deriveCompletedAt(dueDate: string | undefined, createdAt: string, h: number): string {
  if (dueDate) {
    const dueMs = Date.parse(`${dueDate}T09:00:00.000Z`);
    const late = h % 3 === 0;
    const offsetDays = late ? 1 + (h % 3) : -(1 + (h % 2));
    return new Date(Math.min(dueMs + offsetDays * 86_400_000, NOW_MS)).toISOString();
  }
  const createdMs = Date.parse(createdAt);
  return new Date(Math.min(createdMs + (1 + (h % 4)) * 86_400_000, NOW_MS)).toISOString();
}

function enrichCards(boardId: string): EnrichedCard[] {
  const seed = boardSeed(boardId);
  const doneIndex = seed.lists.length - 1; // cột cuối cùng của mỗi board mẫu luôn là trạng thái hoàn thành
  return seed.cards.map((c, i) => {
    const h = hashStr(`${boardId}-${i}-${c.title}`);
    const createdDaysAgo = 2 + (h % 8); // 2..9 ngày trước
    const createdAt = isoDaysAgo(createdDaysAgo, 8 + (h % 10));
    const isDone = c.listIndex === doneIndex;
    return {
      id: `bstat-${boardId}-${i}`,
      title: c.title,
      assigneeId: c.assigneeId ?? MOCK_MEMBERS[h % MOCK_MEMBERS.length].id,
      priority: c.priority,
      dueDate: c.dueDate ?? null,
      createdAt,
      completedAt: isDone ? deriveCompletedAt(c.dueDate, createdAt, h) : null,
      isDone,
    };
  });
}

function computeMemberWorkload(cards: EnrichedCard[]): MemberWorkloadStat[] {
  return MOCK_MEMBERS.map((member) => {
    const mine = cards.filter((c) => c.assigneeId === member.id);
    const overdueCount = mine.filter((c) => !c.isDone && c.dueDate !== null && c.dueDate < TODAY).length;
    const completedCount = mine.filter((c) => c.isDone).length;
    const doingCount = mine.length - completedCount - overdueCount;
    const lastActiveAt = mine.reduce<string | null>((latest, c) => {
      const candidate = c.completedAt ?? c.createdAt;
      return !latest || candidate > latest ? candidate : latest;
    }, null);
    return {
      userId: member.id,
      name: member.displayName ?? member.email,
      avatarUrl: '', // panel dùng avatarColorFor/initialsOf theo userId, không cần ảnh
      assignedCount: mine.length,
      completedCount,
      doingCount,
      overdueCount,
      lastActiveAt,
    };
  });
}

function computeOverview(cards: EnrichedCard[], memberWorkload: MemberWorkloadStat[]): WorkspaceStatsOverview {
  const doneWithDueDate = cards.filter((c) => c.isDone && c.dueDate !== null);
  const onTimeCount = doneWithDueDate.filter((c) => (c.completedAt as string).slice(0, 10) <= (c.dueDate as string)).length;
  return {
    completedCount: memberWorkload.reduce((sum, m) => sum + m.completedCount, 0),
    inProgressCount: memberWorkload.reduce((sum, m) => sum + m.doingCount + m.overdueCount, 0),
    overdueCount: memberWorkload.reduce((sum, m) => sum + m.overdueCount, 0),
    onTimeRatePct: doneWithDueDate.length ? Math.round((onTimeCount / doneWithDueDate.length) * 100) : null,
  };
}

function computeOverdueCards(cards: EnrichedCard[]): OverdueCardInfo[] {
  return cards
    .filter((c) => !c.isDone && c.dueDate !== null && c.dueDate < TODAY)
    .map((c) => ({
      id: c.id,
      title: c.title,
      assigneeId: c.assigneeId,
      assigneeName: MOCK_MEMBERS.find((m) => m.id === c.assigneeId)?.displayName ?? c.assigneeId,
      dueDate: c.dueDate as string,
      daysOverdue: Math.round((Date.parse(TODAY) - Date.parse(c.dueDate as string)) / 86_400_000),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/** Nhật ký hoạt động suy ra từ chính các thẻ của board: 1 dòng "đã tạo" cho mỗi thẻ,
 *  cộng thêm "đã chuyển sang Hoàn thành" cho thẻ done, và rải vài dòng bình luận cho
 *  đa dạng feed — tất cả bám theo tên thẻ thật của board nên đọc tự nhiên, không giả tạo. */
function buildActivityLogs(boardId: string, cards: EnrichedCard[]): ActivityLog[] {
  const nameOf = (id: string) => MOCK_MEMBERS.find((m) => m.id === id)?.displayName ?? id;
  const logs: ActivityLog[] = [];

  cards.forEach((c, i) => {
    logs.push({
      id: `bstat-log-${boardId}-${i}-created`,
      tenantId: 'tenant-demo',
      boardId,
      cardId: c.id,
      userId: c.assigneeId,
      actionType: 'card_created',
      actionText: `${nameOf(c.assigneeId)} đã tạo thẻ "${c.title}"`,
      createdAt: c.createdAt,
    });

    if (c.isDone && c.completedAt) {
      logs.push({
        id: `bstat-log-${boardId}-${i}-done`,
        tenantId: 'tenant-demo',
        boardId,
        cardId: c.id,
        userId: c.assigneeId,
        actionType: 'card_moved',
        actionText: `${nameOf(c.assigneeId)} đã chuyển thẻ "${c.title}" sang Hoàn thành`,
        createdAt: c.completedAt,
      });
    } else if (hashStr(c.id) % 3 === 0) {
      logs.push({
        id: `bstat-log-${boardId}-${i}-comment`,
        tenantId: 'tenant-demo',
        boardId,
        cardId: c.id,
        userId: c.assigneeId,
        actionType: 'comment_added',
        actionText: `${nameOf(c.assigneeId)} đã bình luận vào thẻ "${c.title}"`,
        createdAt: isoDaysAgo(hashStr(`${c.id}-comment`) % 3, 13 + (hashStr(c.id) % 6)),
      });
    }
  });

  return logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Điểm vào chính: toàn bộ số liệu + nhật ký của riêng 1 board, xem boardId (khớp id trên
 *  route /board/:id). Board lạ vẫn trả về dữ liệu hợp lệ (boardSeed() tự rơi về seed mặc định). */
export function mockBoardStats(boardId: string): WorkspaceStatsData {
  const seed = boardSeed(boardId);
  const cards = enrichCards(boardId);
  const memberWorkload = computeMemberWorkload(cards);
  const overview = computeOverview(cards, memberWorkload);
  const overdueCards = computeOverdueCards(cards);
  const activityLogs = buildActivityLogs(boardId, cards);

  return { workspaceName: seed.name, overview, memberWorkload, overdueCards, activityLogs };
}
