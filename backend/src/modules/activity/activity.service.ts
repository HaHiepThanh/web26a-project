import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { AccessService } from '../../common/access/access.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { ActivityActionType } from './activity.types';
import { RealtimeGateway } from '../realtime/realtime.gateway';

/** Khối `users(...)` mà Supabase join kèm — vẫn là snake_case của database. */
interface JoinedUserRow {
  display_name: string | null;
  avatar_url: string | null;
}

/**
 * Đổi khối user join kèm sang camelCase.
 *
 * ⚠️ Thiếu bước này thì API trả ra lai hai kiểu: các trường ngoài cùng camelCase
 *    (`userId`, `createdAt`) còn khối `user` lại snake_case (`display_name`) —
 *    frontend phải nhớ chỗ nào viết kiểu nào.
 */
function toUser(
  row: unknown,
): { displayName: string | null; avatarUrl: string | null } | null {
  const u = row as JoinedUserRow | null;
  if (!u) return null;
  return {
    displayName: u.display_name ?? null,
    avatarUrl: u.avatar_url ?? null,
  };
}

/**
 * [BONUS #6] Activity log feed cho board — đọc/ghi bảng thật `activity_logs`.
 * Các service khác (cards, comments...) inject ActivityService rồi gọi record().
 */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly realtime: RealtimeGateway,
    private readonly access: AccessService,
  ) {}

  // Lấy log của board, mới nhất trước.
  async findAll(uid: string, boardId: string): Promise<unknown[]> {
    if (!boardId) return [];
    await this.access.assertBoardAccess(uid, boardId);

    const { data, error } = await this.supabase.client
      .from('activity_logs')
      .select('*, users(display_name, avatar_url)')
      .eq('board_id', boardId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      this.logger.error(`Đọc nhật ký thất bại: ${error.message}`);
      throw new InternalServerErrorException('Failed to load activity log');
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
      user: toUser(r.users),
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

    const { data: board } = await sb
      .from('boards')
      .select('org_id')
      .eq('id', boardId)
      .maybeSingle();
    if (!board) {
      this.logger.warn(`Không ghi được log: không tìm thấy board ${boardId}`);
      return;
    }

    // `.select().single()` để lấy lại dòng vừa ghi — cần id + created_at thật thì
    // mới phát được cho những người đang mở board, chứ không tự bịa ở client.
    const { data, error } = await sb
      .from('activity_logs')
      .insert({
        org_id: board.org_id,
        board_id: boardId,
        card_id: targetId ?? null,
        user_id: userUid,
        action_type: actionType,
        target_id: targetId ?? null,
        action_text: actionText,
      })
      .select()
      .single();

    if (error) {
      this.logger.warn(`Ghi activity log thất bại: ${error.message}`);
      return;
    }

    const r = data as Record<string, unknown>;
    this.realtime.emitToBoard(boardId, 'activity.created', userUid, {
      id: r.id,
      orgId: r.org_id,
      boardId: r.board_id,
      cardId: r.card_id,
      userId: r.user_id,
      actionType: r.action_type,
      targetId: r.target_id,
      actionText: r.action_text,
      createdAt: r.created_at,
      user: null,
    });
  }
}
