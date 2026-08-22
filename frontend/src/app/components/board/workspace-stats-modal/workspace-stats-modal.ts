import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { ApiBoardStats, WorkspaceStatsData } from '../../../models';
import { ApiService } from '../../../services/api.service';
import { ActivityService } from '../../../services/activity.service';
import { BoardService } from '../../../services/board.service';
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
  private readonly activityService = inject(ActivityService);
  private readonly boardService = inject(BoardService);

  readonly boardId = input.required<string>();
  readonly boardName = input<string | null>(null);

  readonly close = output<void>();

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
      ]);
      this.stats.set(s);
    } catch (e) {
      this.stats.set(null);
      this.loadError.set(describeError(e, 'Không tải được số liệu thống kê.'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Đổi hình dạng API sang hình dạng mà `WorkspaceStatsPanel` đang vẽ. */
  readonly data = computed<WorkspaceStatsData>(() => {
    const s = this.stats();
    const roster = this.boardService.members();
    const tenTheoId = new Map(roster.map((m) => [m.id, m.displayName || m.email]));
    const anhTheoId = new Map(roster.map((m) => [m.id, m.avatarUrl ?? '']));

    return {
      workspaceName: s?.overview?.boardName || this.boardName() || 'Bảng này',
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
        name: m.displayName || tenTheoId.get(m.userId) || 'Ẩn danh',
        avatarUrl: anhTheoId.get(m.userId) ?? '',
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
        assigneeName: c.assigneeName || tenTheoId.get(c.assigneeId ?? '') || 'Chưa gán',
        dueDate: c.dueDate ?? '',
        daysOverdue: c.daysOverdue,
      })),
      activityLogs: this.activityService.logs(),
    };
  });
}
