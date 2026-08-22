import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideTriangleAlert, LucideX } from '@lucide/angular';
import { ActivityActionType, ActivityLog } from '../../../models';
import { avatarColorFor, initialsOf } from '../../../services/board.service';
import { AuthService } from '../../../services/auth.service';
import { MemberWorkloadStat, WorkspaceStatsData } from '../workspace-stats-modal/board-stats.mock';

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

// Không hoạt động từ 3 ngày trở lên (kể cả khi vẫn còn việc đang làm) -> đáng chú ý cho quản lý.
const INACTIVITY_THRESHOLD_DAYS = 3;

let instanceSeq = 0;

/**
 * Khối trình bày cho Modal "Thống kê & Báo cáo" mở từ toolbar Board (board.html/board.ts).
 * Chỉ nhận `data` đã tính sẵn qua input (xem board-stats.mock.ts) — không tự fetch gì, chỉ
 * lo hiển thị + lọc/tìm kiếm tại chỗ. Đúng 3 khối theo yêu cầu UI: dải chỉ số, cảnh báo +
 * tiến độ thành viên, bộ lọc + nhật ký hoạt động.
 */
@Component({
  selector: 'app-workspace-stats-panel',
  imports: [FormsModule, LucideTriangleAlert, LucideX],
  templateUrl: './workspace-stats-panel.html',
})
export class WorkspaceStatsPanel {
  private readonly auth = inject(AuthService);

  readonly data = input.required<WorkspaceStatsData>();
  /** Bỏ trống thì lấy uid thật của người đang đăng nhập (bộ lọc "Của tôi"). */
  readonly currentUserId = input<string>(this.auth.currentUserId());

  readonly overdueDrawerId = `wsp-overdue-drawer-${instanceSeq++}`;

  readonly actionGroups = ACTION_GROUPS;
  readonly actionGroupLabel = ACTION_GROUP_LABEL;

  readonly overview = computed(() => this.data().overview);
  readonly overdueCards = computed(() => this.data().overdueCards);
  readonly memberWorkload = computed(() => this.data().memberWorkload);

  readonly inactiveMembers = computed(() =>
    this.memberWorkload().filter((m) => {
      if (!m.lastActiveAt) return true;
      const daysSince = (Date.now() - new Date(m.lastActiveAt).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince >= INACTIVITY_THRESHOLD_DAYS;
    }),
  );

  readonly inactiveMembersLabel = computed(() => this.inactiveMembers().map((m) => m.name).join(', '));

  readonly selectedMemberId = signal<'all' | string>('all');
  readonly logScope = signal<LogScope>('team');
  readonly logSearch = signal('');
  readonly actionFilter = signal<ActionGroup>('all');

  readonly maxAssignedCount = computed(() => Math.max(1, ...this.memberWorkload().map((m) => m.assignedCount)));

  readonly sortedWorkload = computed(() =>
    [...this.memberWorkload()]
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
    const me = this.currentUserId();
    return this.data().activityLogs.filter((log) => {
      if (scope === 'mine' && log.userId !== me) return false;
      if (memberId !== 'all' && log.userId !== memberId) return false;
      if (group !== 'all' && ACTION_GROUP[log.actionType] !== group) return false;
      if (query && !log.actionText.toLowerCase().includes(query)) return false;
      return true;
    });
  });

  // Không rơi về "Bạn" như actionText (đã có sẵn "Bạn đã..." trong chính câu log) — dùng
  // để tô tên thật lên avatar/tooltip, tránh vênh với chữ cái đầu hiển thị trên avatar tròn.
  memberName(userId: string): string {
    return this.memberWorkload().find((m) => m.userId === userId)?.name ?? userId;
  }

  avatarInitials(userId: string): string {
    return initialsOf(this.memberName(userId));
  }

  avatarColor(userId: string): string {
    return avatarColorFor(userId);
  }

  actionIcon(actionType: ActivityActionType): string {
    return ACTION_ICON[actionType];
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
    link.download = `board-stats-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  trackByUserId = (_: number, item: MemberWorkloadStat) => item.userId;
  trackByLogId = (_: number, item: ActivityLog) => item.id;
  trackByCardId = (_: number, item: { id: string }) => item.id;
  trackByGroup = (_: number, item: ActionGroup) => item;
}
