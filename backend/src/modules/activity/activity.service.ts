import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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

  /**
   * Người gọi có được đụng vào board này không? Không thì 404.
   *
   * ⚠️ Nhật ký ghi lại ai làm gì trong nội bộ công ty — thiếu hàm này thì người
   *    ngoài đọc được toàn bộ hoạt động của mọi tổ chức khác.
   */
  private async assertBoardAccess(uid: string, boardId: string): Promise<void> {
    const sb = this.supabase.client;
    const { data: board, error } = await sb
      .from('boards')
      .select('id, org_id')
      .eq('id', boardId)
      .maybeSingle();
    // 22P02 = id gõ sai định dạng uuid → coi như không tồn tại.
    if (error?.code === '22P02' || !board) throw new NotFoundException('Không tìm thấy board.');

    const { data: member } = await sb
      .from('organization_members')
      .select('role')
      .eq('org_id', board.org_id as string)
      .eq('user_id', uid)
      .maybeSingle();
    if (!member) throw new NotFoundException('Không tìm thấy board.');
  }

  // Lấy log của board, mới nhất trước.
  async findAll(uid: string, boardId: string): Promise<unknown[]> {
    if (!boardId) return [];
    await this.assertBoardAccess(uid, boardId);

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

    // Đổi sang camelCase cho khớp phần còn lại của API.
    return (data as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      orgId: r.org_id,
      boardId: r.board_id,
      cardId: r.card_id,
      userId: r.user_id,
      actionType: r.action_type,
      targetId: r.target_id,
      actionText: r.action_text,
      createdAt: r.created_at,
      user: r.users,
    }));
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
