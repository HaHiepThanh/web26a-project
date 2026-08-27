import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideArrowRight,
  LucideFilePlus,
  LucideMessageSquare,
  LucidePencil,
  LucideTrash2,
  LucideTriangleAlert,
  LucideUserPlus,
  LucideX,
} from '@lucide/angular';
import { ActivityActionType, ActivityLog, MemberWorkloadStat, WorkspaceStatsData } from '../../../models';
import { AuthService } from '../../../services/auth.service';
import { UserAvatar } from '../../shared/user-avatar/user-avatar';


type LogScope = 'mine' | 'team';
type ActionGroup = 'all' | 'created' | 'moved' | 'assigned' | 'updated' | 'deleted';

// Mỗi loại hành động một màu badge tròn (bg nhạt + icon đậm), thay cho emoji
// cũ để nhất quán với bộ icon lucide dùng chung toàn app. Dùng thẳng bảng màu
// gốc của Tailwind (green/blue/red/yellow) thay vì success/info/warning/error
// của theme daisyUI — winter/night tô 4 màu đó pastel có chủ đích nên đọc
// nhạt trên nền badge nhỏ, không "pha" gì thêm cho đậm lên nữa.
const ACTION_ICON_CLASS: Record<ActivityActionType, string> = {
  card_created: 'bg-green-500/15 text-green-600',
  card_moved: 'bg-blue-500/15 text-blue-600',
  card_updated: 'bg-yellow-500/15 text-yellow-600',
  card_deleted: 'bg-red-500/15 text-red-600',
  card_assigned: 'bg-primary/15 text-primary',
  comment_added: 'bg-secondary/15 text-secondary',
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
  all: 'All actions',
  created: 'Created',
  moved: 'Status change',
  assigned: 'Assigned',
  updated: 'Comment/Update',
  deleted: 'Deleted',
};

const ACTION_GROUPS: ActionGroup[] = ['all', 'created', 'moved', 'assigned', 'updated', 'deleted'];

// Không hoạt động từ 3 ngày trở lên (kể cả khi vẫn còn việc đang làm) -> đáng chú ý cho quản lý.
const INACTIVITY_THRESHOLD_DAYS = 3;

let instanceSeq = 0;

/**
 * Khối trình bày cho Modal "Thống kê & Báo cáo" mở từ toolbar Board (board.html/board.ts).
 * Chỉ nhận `data` qua input (modal cha lấy từ `GET /stats/boards/:id`) — không tự fetch gì, chỉ
 * lo hiển thị + lọc/tìm kiếm tại chỗ. Đúng 3 khối theo yêu cầu UI: dải chỉ số, cảnh báo +
 * tiến độ thành viên, bộ lọc + nhật ký hoạt động.
 */
@Component({
  selector: 'app-workspace-stats-panel',
  imports: [
    FormsModule,
    LucideArrowRight,
    LucideFilePlus,
    LucideMessageSquare,
    LucidePencil,
    LucideTrash2,
    LucideTriangleAlert,
    LucideUserPlus,
    LucideX,
    UserAvatar,
  ],
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

  /** Ảnh của người ghi nhật ký — ưu tiên lấy từ chính log.user nếu có, rồi tra sang memberWorkload */
  memberAvatarUrl(userId: string, log?: ActivityLog): string | undefined {
    return log?.user?.avatarUrl ?? this.memberWorkload().find((m) => m.userId === userId)?.avatarUrl ?? undefined;
  }

  actionIconClass(actionType: ActivityActionType): string {
    return ACTION_ICON_CLASS[actionType];
  }

  relativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  lastActiveLabel(stat: MemberWorkloadStat): string {
    return stat.lastActiveAt ? this.relativeTime(stat.lastActiveAt) : 'No activity yet';
  }

  // Xuất CSV chạy hoàn toàn phía trình duyệt (Blob + link ẩn) — không gửi dữ liệu đi đâu cả.
  exportWorkloadCsv(): void {
    const header = ['Member', 'Assigned', 'Completed', 'In Progress', 'Overdue', 'Last Active'];
    const rows = this.sortedWorkload().map((m) => [
      m.name,
      String(m.assignedCount),
      String(m.completedCount),
      String(m.doingCount),
      String(m.overdueCount),
      m.lastActiveAt ?? 'No activity yet',
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
