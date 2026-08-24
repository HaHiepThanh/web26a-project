import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { AccessService } from '../../common/access/access.service';

export interface BoardStatsResponse {
  overview: {
    boardId: string;
    boardName: string;
    totalCards: number;
    completedCount: number;
    inProgressCount: number;
    overdueCount: number;
    onTimeRatePct: number;
  } | null;
  memberWorkload: {
    userId: string;
    displayName: string | null;
    assignedCount: number;
    completedCount: number;
    doingCount: number;
    overdueCount: number;
    lastActiveAt: string | null;
  }[];
  overdueCards: {
    cardId: string;
    title: string;
    assigneeId: string | null;
    assigneeName: string | null;
    dueDate: string | null;
    daysOverdue: number;
  }[];
}

/**
 * Thống kê board — đọc từ 3 VIEW đã dựng sẵn trong database:
 * `board_stats_overview`, `board_member_workload`, `board_overdue_cards`.
 *
 * ── View thì có gì khác bảng?
 * View là một câu SELECT đã đặt tên sẵn: nó KHÔNG lưu dữ liệu, mỗi lần đọc là
 * database tính lại từ `cards`/`users`. Nhờ vậy con số luôn khớp thực tế, và
 * phần đếm/tính tỉ lệ nằm ở database chứ không phải kéo hết thẻ về rồi cộng
 * trong Node.
 *
 * ⚠️ Nhưng view KHÔNG tự có quyền: đọc view vẫn qua `service_role key` nên vẫn
 *    bỏ qua RLS y hệt bảng thường. Vẫn phải `assertBoardAccess` trước.
 *
 * Gộp cả 3 vào MỘT endpoint vì modal Thống kê cần cả ba cùng lúc — tách ra 3
 * request chỉ khiến giao diện hiện lắp ghép từng mảnh.
 */
@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly access: AccessService,
  ) {}

  async boardStats(uid: string, boardId: string): Promise<BoardStatsResponse> {
    await this.access.assertBoardAccess(uid, boardId);
    const sb = this.supabase.client;

    // Ba view độc lập nhau → gọi SONG SONG, không nối đuôi.
    const [overviewRes, workloadRes, overdueRes] = await Promise.all([
      sb.from('board_stats_overview').select('*').eq('board_id', boardId).maybeSingle(),
      sb.from('board_member_workload').select('*').eq('board_id', boardId),
      sb.from('board_overdue_cards').select('*').eq('board_id', boardId).order('days_overdue', { ascending: false }),
    ]);

    const loi = overviewRes.error ?? workloadRes.error ?? overdueRes.error;
    if (loi) {
      this.logger.error(`Đọc thống kê thất bại (board=${boardId}): ${loi.message}`);
      throw new InternalServerErrorException('Failed to load statistics');
    }

    const o = overviewRes.data as Record<string, unknown> | null;

    return {
      overview: o
        ? {
            boardId: o.board_id as string,
            boardName: (o.board_name as string) ?? '',
            totalCards: Number(o.total_cards ?? 0),
            completedCount: Number(o.completed_count ?? 0),
            inProgressCount: Number(o.in_progress_count ?? 0),
            overdueCount: Number(o.overdue_count ?? 0),
            onTimeRatePct: Number(o.on_time_rate_pct ?? 0),
          }
        : null,
      memberWorkload: ((workloadRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
        userId: r.user_id as string,
        displayName: (r.display_name as string) ?? null,
        assignedCount: Number(r.assigned_count ?? 0),
        completedCount: Number(r.completed_count ?? 0),
        doingCount: Number(r.doing_count ?? 0),
        overdueCount: Number(r.overdue_count ?? 0),
        lastActiveAt: (r.last_active_at as string) ?? null,
      })),
      overdueCards: ((overdueRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
        cardId: r.card_id as string,
        title: (r.title as string) ?? '',
        assigneeId: (r.assignee_id as string) ?? null,
        assigneeName: (r.assignee_name as string) ?? null,
        dueDate: (r.due_date as string) ?? null,
        daysOverdue: Number(r.days_overdue ?? 0),
      })),
    };
  }
}
