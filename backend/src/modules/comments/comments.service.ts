import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AccessService } from '../../common/access/access.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { ActivityService } from '../activity/activity.service';
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

/** [BONUS #4] Bình luận trong card. */
@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeGateway,
    private readonly access: AccessService,
  ) {}

  /**
   * Người gọi có được đụng vào thẻ này không? Không thì 404.
   *
   * ⚠️ Backend dùng service_role key nên RLS bị bỏ qua — thiếu hàm này thì bất kỳ
   *    ai đăng nhập cũng đọc được bình luận nội bộ của mọi công ty khác.
   */
  private async assertCardAccess(
    uid: string,
    cardId: string,
  ): Promise<{ title: string; boardId?: string }> {
    const sb = this.supabase.client;
    const { data: card, error } = await sb
      .from('cards')
      .select('id, org_id, title, lists(board_id)')
      .eq('id', cardId)
      .maybeSingle();
    // 22P02 = id gõ sai định dạng uuid → coi như không tồn tại.
    if (error?.code === '22P02' || !card)
      throw new NotFoundException('Card not found.');

    // Bản dùng chung kiểm đủ ba tầng (tổ chức → workspace restricted → board
    // private) và cũng trả 404 cho mọi trường hợp, nên không lộ thẻ có thật hay
    // không. Kiểm mỗi organization_members như trước là bỏ lọt hai tầng sau.
    await this.access.assertCardAccess(uid, cardId);

    return {
      title: card.title as string,
      boardId: (card.lists as unknown as { board_id: string } | null)?.board_id,
    };
  }

  async findAll(uid: string, cardId: string): Promise<unknown[]> {
    if (!cardId) return [];
    await this.assertCardAccess(uid, cardId);
    const sb = this.supabase.client;

    const { data, error } = await sb
      .from('comments')
      .select(
        'id, user_id, content, created_at, users(display_name, avatar_url)',
      )
      .eq('card_id', cardId)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(`Đọc bình luận thất bại: ${error.message}`);
      throw new InternalServerErrorException('Failed to load comments');
    }

    // userId là BẮT BUỘC: frontend dùng nó để chỉ hiện nút Xoá trên bình luận của
    // chính mình (backend vẫn chặn lần nữa, đây chỉ là để ẩn nút cho gọn).
    return data.map((c) => ({
      id: c.id,
      userId: c.user_id,
      content: c.content,
      createdAt: c.created_at,
      user: toUser(c.users),
    }));
  }

  async create(
    cardId: string,
    userUid: string,
    content: string,
  ): Promise<unknown> {
    const card = await this.assertCardAccess(userUid, cardId);
    const sb = this.supabase.client;

    const { data, error } = await sb
      .from('comments')
      .insert({ card_id: cardId, user_id: userUid, content })
      .select()
      .single();

    if (error) {
      this.logger.error(`Tạo bình luận thất bại: ${error.message}`);
      throw new InternalServerErrorException('Failed to save comment');
    }

    // Đổi sang camelCase cho khớp phần còn lại của API.
    const row = data as Record<string, unknown>;
    const created = {
      id: row.id,
      cardId: row.card_id,
      userId: row.user_id,
      content: row.content,
      createdAt: row.created_at,
    };

    if (card.boardId) {
      this.realtime.emitToBoard(
        card.boardId,
        'comment.created',
        userUid,
        created,
      );
      await this.activity.record(
        card.boardId,
        userUid,
        'comment_added',
        `Commented on card "${card.title}"`,
        cardId,
      );
    }

    return created;
  }

  async remove(id: string, userUid: string): Promise<void> {
    const sb = this.supabase.client;

    const { data: comment } = await sb
      .from('comments')
      .select('id, user_id, card_id, cards(lists(board_id))')
      .eq('id', id)
      .maybeSingle();

    if (!comment) throw new NotFoundException('Comment not found.');

    if (comment.user_id !== userUid) {
      throw new ForbiddenException('You can only delete your own comments.');
    }

    const { error } = await sb.from('comments').delete().eq('id', id);

    if (error) {
      this.logger.error(`Xoá bình luận thất bại: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete comment');
    }

    const boardId = (
      comment.cards as unknown as { lists: { board_id: string } | null } | null
    )?.lists?.board_id;
    if (boardId) {
      this.realtime.emitToBoard(boardId, 'comment.deleted', userUid, {
        id,
        cardId: comment.card_id as string,
      });
    }
  }
}
