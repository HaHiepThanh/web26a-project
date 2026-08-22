import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { ActivityService } from '../activity/activity.service';

/** [BONUS #4] Bình luận trong card. */
@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly activity: ActivityService,
  ) {}

  /**
   * Người gọi có được đụng vào thẻ này không? Không thì 404.
   *
   * ⚠️ Backend dùng service_role key nên RLS bị bỏ qua — thiếu hàm này thì bất kỳ
   *    ai đăng nhập cũng đọc được bình luận nội bộ của mọi công ty khác.
   */
  private async assertCardAccess(uid: string, cardId: string): Promise<{ title: string; boardId?: string }> {
    const sb = this.supabase.client;
    const { data: card, error } = await sb
      .from('cards')
      .select('id, org_id, title, lists(board_id)')
      .eq('id', cardId)
      .maybeSingle();
    // 22P02 = id gõ sai định dạng uuid → coi như không tồn tại.
    if (error?.code === '22P02' || !card) throw new NotFoundException('Không tìm thấy thẻ.');

    const { data: member } = await sb
      .from('organization_members')
      .select('role')
      .eq('org_id', card.org_id as string)
      .eq('user_id', uid)
      .maybeSingle();
    // 404 chứ không phải 403: đừng xác nhận "thẻ này có thật" cho người ngoài.
    if (!member) throw new NotFoundException('Không tìm thấy thẻ.');

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
      .select('id, user_id, content, created_at, users(display_name, avatar_url)')
      .eq('card_id', cardId)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(`Đọc bình luận thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không đọc được bình luận');
    }

    // userId là BẮT BUỘC: frontend dùng nó để chỉ hiện nút Xoá trên bình luận của
    // chính mình (backend vẫn chặn lần nữa, đây chỉ là để ẩn nút cho gọn).
    return data.map((c) => ({
      id: c.id,
      userId: c.user_id,
      content: c.content,
      createdAt: c.created_at,
      user: c.users,
    }));
  }

  async create(cardId: string, userUid: string, content: string): Promise<unknown> {
    const card = await this.assertCardAccess(userUid, cardId);
    const sb = this.supabase.client;

    const { data, error } = await sb
      .from('comments')
      .insert({ card_id: cardId, user_id: userUid, content })
      .select()
      .single();

    if (error) {
      this.logger.error(`Tạo bình luận thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không lưu được bình luận');
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
      await this.activity.record(
        card.boardId,
        userUid,
        'comment_added',
        `Đã bình luận vào thẻ "${card.title}"`,
        cardId,
      );
    }

    return created;
  }

  async remove(id: string, userUid: string): Promise<void> {
    const sb = this.supabase.client;

    const { data: comment } = await sb
      .from('comments')
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle();

    if (!comment) throw new NotFoundException('Không tìm thấy bình luận.');

    if (comment.user_id !== userUid) {
      throw new ForbiddenException('Bạn chỉ xoá được bình luận của mình.');
    }

    const { error } = await sb.from('comments').delete().eq('id', id);

    if (error) {
      this.logger.error(`Xoá bình luận thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không xoá được bình luận');
    }
  }
}
