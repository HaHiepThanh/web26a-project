import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { ActivityActionType } from './activity.types';

/**
 * [BONUS #6] Activity log feed cho board — đọc/ghi bảng thật `activity_logs`.
 * Các service khác (cards, comments...) inject ActivityService rồi gọi record().
 */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(private readonly supabase: SupabaseService) {}

  // Lấy log của board, mới nhất trước.
  async findAll(boardId: string): Promise<unknown[]> {
    const { data, error } = await this.supabase.client
      .from('activity_logs')
      .select('*, users(display_name, avatar_url)')
      .eq('board_id', boardId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      this.logger.error(`Đọc nhật ký thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không đọc được nhật ký');
    }

    return data;
  }

  /**
   * Ghi 1 dòng log khi có hành động quan trọng (tạo/chuyển card, thêm bình luận...).
   * Không throw khi ghi log thất bại — đây là việc phụ, không được làm hỏng hành
   * động chính (tạo thẻ, thêm bình luận...) mà caller đang thực hiện.
   */
  async record(
    boardId: string,
    userUid: string,
    actionType: ActivityActionType,
    actionText: string,
    targetId?: string,
  ): Promise<void> {
    const sb = this.supabase.client;

    const { data: board } = await sb.from('boards').select('org_id').eq('id', boardId).maybeSingle();
    if (!board) {
      this.logger.warn(`Không ghi được log: không tìm thấy board ${boardId}`);
      return;
    }

    const { error } = await sb.from('activity_logs').insert({
      org_id: board.org_id,
      board_id: boardId,
      card_id: targetId ?? null,
      user_id: userUid,
      action_type: actionType,
      target_id: targetId ?? null,
      action_text: actionText,
    });

    if (error) {
      this.logger.warn(`Ghi activity log thất bại: ${error.message}`);
    }
  }
}
