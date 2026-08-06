import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { createMockActivityLogs } from './activity.mock';
import { ActivityActionType, ActivityLogRecord } from './activity.types';

/**
 * [BONUS #6] Activity log feed cho board.
 * Lưu tạm trong bộ nhớ (chưa nối bảng activity_logs thật) để FE có dữ liệu test
 * ngay trong lúc chờ Supabase. Khi nối bảng thật, thay nội dung 2 hàm bên dưới
 * bằng query tới this.supabase.client — giữ nguyên chữ ký hàm để không phải sửa
 * chỗ gọi (board activity-feed, trang Workspace Stats).
 */
@Injectable()
export class ActivityService {
  constructor(private readonly supabase: SupabaseService) {}

  private readonly logs: ActivityLogRecord[] = createMockActivityLogs();

  // Lấy log của board, mới nhất trước.
  async findAll(boardId: string): Promise<ActivityLogRecord[]> {
    return this.logs
      .filter((entry) => entry.boardId === boardId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // Ghi 1 dòng log khi có hành động quan trọng (tạo/sửa/xoá/di chuyển card, comment...).
  // Các service khác (cards, comments...) inject ActivityService rồi gọi hàm này.
  async record(
    boardId: string,
    userUid: string,
    actionType: ActivityActionType,
    actionText: string,
    targetId?: string,
  ): Promise<void> {
    const tenantId = this.logs.find((entry) => entry.boardId === boardId)?.tenantId ?? 'tenant-1';
    this.logs.push({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tenantId,
      boardId,
      userId: userUid,
      actionType,
      targetId,
      actionText,
      createdAt: new Date().toISOString(),
    });
  }
}
