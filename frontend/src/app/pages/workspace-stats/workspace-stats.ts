import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivityActionType, ActivityLog, CardPriority } from '../../models';
import { CURRENT_USER_ID } from '../settings/manage-workspace/manage-workspace.models';
import { MemberWorkloadStat, mockWorkspaceStats } from './workspace-stats.mock';

type DateRange = '7d' | '30d';
type LogScope = 'mine' | 'team';
type ActionGroup = 'all' | 'created' | 'moved' | 'assigned' | 'updated' | 'deleted';

const ACTION_ICON: Record<ActivityActionType, string> = {
  card_created: '🆕',
  card_moved: '➡️',
  card_updated: '✏️',
  card_deleted: '🗑️',
  card_assigned: '👤',
  comment_added: '💬',
};

const ACTION_GROUP: Record<ActivityActionType, ActionGroup> = {
  card_created: 'created',
  card_moved: 'moved',
  card_assigned: 'assigned',
  card_updated: 'updated',
  comment_added: 'updated',
  card_deleted: 'deleted',
};

const ACTION_GROUP_LABEL: Record<ActionGroup, string> = {
  all: 'Tất cả hành động',
  created: 'Tạo mới',
  moved: 'Chuyển trạng thái',
  assigned: 'Gán người phụ trách',
  updated: 'Bình luận/Cập nhật',
  deleted: 'Xoá',
};

const ACTION_GROUPS: ActionGroup[] = ['all', 'created', 'moved', 'assigned', 'updated', 'deleted'];

// Cao = đỏ (bắt mắt tối đa); Trung bình = vàng dịu; Thấp = xanh dương — dùng màu ngữ nghĩa của daisyUI.
const PRIORITY_STYLE: Record<CardPriority, { label: string; progressClass: string; textClass: string }> = {
  high: { label: 'Cao', progressClass: 'progress-error', textClass: 'text-error' },
  medium: { label: 'Trung bình', progressClass: 'progress-warning', textClass: 'text-warning' },
  low: { label: 'Thấp', progressClass: 'progress-info', textClass: 'text-info' },
};

// Không hoạt động từ 3 ngày trở lên (kể cả khi vẫn còn việc đang làm) -> đáng chú ý cho quản lý.
const INACTIVITY_THRESHOLD_DAYS = 3;

// Chiều cao tối đa (px) của cột trong "Hoạt động theo ngày". Cột đo bằng px thay vì %
// của container cố định, để phần màu luôn chạm đúng mép trên của chính nó — nhờ vậy
// góc bo (rounded-t) luôn hiện đúng ở mọi cột, không chỉ cột cao nhất (100%).
const DAILY_BAR_MAX_PX = 80;

/** Trang thống kê thành viên workspace (#bonus): nhật ký hoạt động + tổng quan tiến độ.
 *  Dữ liệu lấy từ workspace-stats.mock.ts — xem file đó để biết cách nối API thật sau này. */
@Component({
  selector: 'app-workspace-stats',
  imports: [FormsModule],
  templateUrl: './workspace-stats.html',
  styleUrl: './workspace-stats.css',
})
export class WorkspaceStats {
  private readonly data = mockWorkspaceStats();

  readonly workspaceName = this.data.workspaceName;
  readonly overview = this.data.overview;
  readonly memberWorkload = this.data.memberWorkload;
  readonly overdueCards = this.data.overdueCards;

  readonly actionGroups = ACTION_GROUPS;
  readonly actionGroupLabel = ACTION_GROUP_LABEL;

  readonly maxPriorityCount = computed(() => Math.max(1, ...this.data.priorityBreakdown.map((p) => p.count)));

  readonly priorityBreakdown = computed(() =>
    this.data.priorityBreakdown.map((p) => ({
      ...p,
      ...PRIORITY_STYLE[p.priority],
      barPct: Math.round((p.count / this.maxPriorityCount()) * 100),
    })),
  );

  readonly inactiveMembers = computed(() =>
    this.memberWorkload.filter((m) => {
      if (!m.lastActiveAt) return true;
      const daysSince = (Date.now() - new Date(m.lastActiveAt).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince >= INACTIVITY_THRESHOLD_DAYS;
    }),
  );

  readonly inactiveMembersLabel = computed(() => this.inactiveMembers().map((m) => m.name).join(', '));

  readonly dateRange = signal<DateRange>('7d');
  readonly selectedMemberId = signal<'all' | string>('all');
  readonly logScope = signal<LogScope>('team');
  readonly logSearch = signal('');
  readonly actionFilter = signal<ActionGroup>('all');
  readonly selectedDate = signal<string | null>(null);

  // Mock hiện chỉ seed 7 ngày gần nhất; chọn "30 ngày" sẽ hiển thị toàn bộ dữ liệu
  // đang có (không bịa thêm điểm dữ liệu giả cho những ngày chưa seed).
  private readonly rangeDays = computed(() => (this.dateRange() === '7d' ? 7 : 30));

  private readonly visibleDailyActivity = computed(() => {
    const all = this.data.dailyActivity;
    const days = Math.min(this.rangeDays(), all.length);
    return all.slice(all.length - days);
  });

  readonly maxDailyTotal = computed(() =>
    Math.max(1, ...this.visibleDailyActivity().map((d) => d.createdCount + d.completedCount)),
  );

  readonly dailyActivity = computed(() => {
    const max = this.maxDailyTotal();
    const px = (count: number) => (count > 0 ? Math.max(2, Math.round((count / max) * DAILY_BAR_MAX_PX)) : 0);
    return this.visibleDailyActivity().map((d) => ({
      ...d,
      createdPx: px(d.createdCount),
      completedPx: px(d.completedCount),
    }));
  });

  readonly selectedDailyPoint = computed(() => this.dailyActivity().find((d) => d.date === this.selectedDate()) ?? null);

  readonly maxAssignedCount = computed(() => Math.max(1, ...this.memberWorkload.map((m) => m.assignedCount)));

  readonly sortedWorkload = computed(() =>
    [...this.memberWorkload]
      .sort((a, b) => b.assignedCount - a.assignedCount)
      .map((m) => ({
        ...m,
        donePct: Math.round((m.completedCount / this.maxAssignedCount()) * 100),
        doingPct: Math.round((m.doingCount / this.maxAssignedCount()) * 100),
        overduePct: Math.round((m.overdueCount / this.maxAssignedCount()) * 100),
      })),
  );

  readonly filteredActivityLogs = computed<ActivityLog[]>(() => {
    const scope = this.logScope();
    const memberId = this.selectedMemberId();
    const group = this.actionFilter();
    const query = this.logSearch().trim().toLowerCase();
    return this.data.activityLogs.filter((log) => {
      if (scope === 'mine' && log.userId !== CURRENT_USER_ID) return false;
      if (memberId !== 'all' && log.userId !== memberId) return false;
      if (group !== 'all' && ACTION_GROUP[log.actionType] !== group) return false;
      if (query && !log.actionText.toLowerCase().includes(query)) return false;
      return true;
    });
  });

  memberName(userId: string): string {
    if (userId === CURRENT_USER_ID) return 'Bạn';
    return this.memberWorkload.find((m) => m.userId === userId)?.name ?? userId;
  }

  memberAvatar(userId: string): string {
    return this.memberWorkload.find((m) => m.userId === userId)?.avatarUrl ?? '';
  }

  actionIcon(actionType: ActivityActionType): string {
    return ACTION_ICON[actionType];
  }

  initials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(-2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }

  relativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'vừa xong';
    if (minutes < 60) return `${minutes} phút trước`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    return `${days} ngày trước`;
  }

  lastActiveLabel(stat: MemberWorkloadStat): string {
    return stat.lastActiveAt ? this.relativeTime(stat.lastActiveAt) : 'Chưa có hoạt động';
  }

  // Xuất CSV chạy hoàn toàn phía trình duyệt (Blob + link ẩn) — không gửi dữ liệu đi đâu cả.
  exportWorkloadCsv(): void {
    const header = ['Thành viên', 'Được giao', 'Hoàn thành', 'Đang thực hiện', 'Quá hạn', 'Hoạt động gần nhất'];
    const rows = this.sortedWorkload().map((m) => [
      m.name,
      String(m.assignedCount),
      String(m.completedCount),
      String(m.doingCount),
      String(m.overdueCount),
      m.lastActiveAt ?? 'Chưa có hoạt động',
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\r\n');

    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `workspace-stats-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  trackByUserId = (_: number, item: MemberWorkloadStat) => item.userId;
  trackByLogId = (_: number, item: ActivityLog) => item.id;
  trackByDate = (_: number, item: { date: string }) => item.date;
  trackByPriority = (_: number, item: { priority: CardPriority }) => item.priority;
  trackByCardId = (_: number, item: { id: string }) => item.id;
  trackByGroup = (_: number, item: ActionGroup) => item;
}
