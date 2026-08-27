import { Component, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { ApiBoardStats, WorkspaceStatsData } from '../../../models';
import { ApiService } from '../../../services/api.service';
import { ActivityStore } from '../../../ngrx/activity/activity.store';
import { BoardStore } from '../../../ngrx/board/board.store';
import { OrganizationStore } from '../../../ngrx/organization/organization.store';
import { describeError } from '../../../services/api-error.util';
import { WorkspaceStatsPanel } from '../workspace-stats-panel/workspace-stats-panel';

/**
 * Modal "Thống kê & Báo cáo" — GỌI BACKEND THẬT (`GET /stats/boards/:id`).
 *
 * Trước đây số liệu do `board-stats.mock.ts` tự tính ở trình duyệt từ bộ dữ liệu
 * seed: nhìn thì có vẻ hợp lý, nhưng không liên quan gì tới thẻ thật trong
 * database. Nay đọc từ 3 view đã dựng sẵn (`board_stats_overview`,
 * `board_member_workload`, `board_overdue_cards`) — database tính lại mỗi lần
 * gọi nên con số luôn khớp thực tế.
 *
 * Nhật ký hoạt động lấy từ `ActivityService` (đã nối `GET /activity` từ trước).
 */
@Component({
  selector: 'app-workspace-stats-modal',
  imports: [WorkspaceStatsPanel],
  templateUrl: './workspace-stats-modal.html',
})
export class WorkspaceStatsModal {
  private readonly api = inject(ApiService);
  private readonly activityService = inject(ActivityStore);
  private readonly boardService = inject(BoardStore);
  private readonly orgService = inject(OrganizationStore);

  readonly boardId = input.required<string>();
  readonly boardName = input<string | null>(null);

  readonly close = output<void>();

  /** Nút "Export CSV" đứng ở thanh tiêu đề (cạnh nút đóng) nhưng dữ liệu đã sắp
   *  xếp để xuất file lại nằm trong panel — trỏ thẳng vào panel để gọi, khỏi
   *  chép lại logic sắp xếp `sortedWorkload()` ở hai nơi. Chỉ có mặt ở nhánh
   *  `@else` của template nên phải hứng trường hợp `undefined` khi đang tải/lỗi. */
  readonly statsPanel = viewChild(WorkspaceStatsPanel);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  private readonly stats = signal<ApiBoardStats | null>(null);

  constructor() {
    effect(() => {
      const id = this.boardId();
      if (id) void this.load(id);
    });
  }

  private async load(boardId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [s] = await Promise.all([
        this.api.get<ApiBoardStats>(`/stats/boards/${boardId}`),
        // Nhật ký cần cho khối cuối của modal; gọi song song, không nối đuôi.
        this.activityService.loadLogs(boardId).catch(() => undefined),
        // Đảm bảo thông tin thành viên tổ chức (kèm avatar) được nạp đầy đủ
        this.orgService.ensureLoaded().catch(() => undefined),
      ]);
      this.stats.set(s);
    } catch (e) {
      this.stats.set(null);
      this.loadError.set(describeError(e, 'Failed to load stats.'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Đổi hình dạng API sang hình dạng mà `WorkspaceStatsPanel` đang vẽ. */
  readonly data = computed<WorkspaceStatsData>(() => {
    const s = this.stats();
    // Gom toàn bộ thành viên từ boardService + OrganizationStore để dự phòng
    const board = this.boardService.currentBoard();
    const orgId = board?.orgId || this.orgService.activeOrgId();
    const orgMembers = this.orgService.membersOf(orgId).map((m) => m.user);
    const allKnownUsers = [
      ...this.boardService.members(),
      ...orgMembers,
      ...Object.values(this.orgService.membersByOrg()).flatMap((list) => list.map((m) => m.user)),
    ];

    const tenTheoId = new Map(allKnownUsers.map((m) => [m.id, m.displayName || m.email]));
    const anhTheoId = new Map(allKnownUsers.map((m) => [m.id, m.avatarUrl ?? '']));

    return {
      workspaceName: s?.overview?.boardName || this.boardName() || 'This board',
      overview: {
        completedCount: s?.overview?.completedCount ?? 0,
        inProgressCount: s?.overview?.inProgressCount ?? 0,
        overdueCount: s?.overview?.overdueCount ?? 0,
        // View trả 0 khi board chưa có thẻ nào — lúc đó "tỉ lệ đúng hạn" không có
        // nghĩa gì, để null cho panel hiện dấu gạch thay vì "0%".
        onTimeRatePct: s?.overview && s.overview.totalCards > 0 ? s.overview.onTimeRatePct : null,
      },
      memberWorkload: (s?.memberWorkload ?? []).map((m) => ({
        userId: m.userId,
        name: m.displayName || tenTheoId.get(m.userId) || 'Anonymous',
        avatarUrl: m.avatarUrl || anhTheoId.get(m.userId) || '',
        assignedCount: m.assignedCount,
        completedCount: m.completedCount,
        doingCount: m.doingCount,
        overdueCount: m.overdueCount,
        lastActiveAt: m.lastActiveAt,
      })),
      overdueCards: (s?.overdueCards ?? []).map((c) => ({
        id: c.cardId,
        title: c.title,
        assigneeId: c.assigneeId ?? '',
        assigneeName: c.assigneeName || tenTheoId.get(c.assigneeId ?? '') || 'Unassigned',
        dueDate: c.dueDate ?? '',
        daysOverdue: c.daysOverdue,
      })),
      activityLogs: this.activityService.logs(),
    };
  });
}
