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

  async findAll(cardId: string): Promise<unknown[]> {
    const sb = this.supabase.client;

    const { data, error } = await sb
      .from('comments')
      .select('id, content, created_at, users(display_name, avatar_url)')
      .eq('card_id', cardId)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(`Đọc bình luận thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không đọc được bình luận');
    }

    return data.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.created_at,
      user: c.users,
    }));
  }

  async create(cardId: string, userUid: string, content: string): Promise<unknown> {
    const sb = this.supabase.client;

    const { data: card } = await sb
      .from('cards')
      .select('id, title, lists(board_id)')
      .eq('id', cardId)
      .maybeSingle();
    if (!card) throw new NotFoundException('Không tìm thấy thẻ.');

    const { data, error } = await sb
      .from('comments')
      .insert({ card_id: cardId, user_id: userUid, content })
      .select()
      .single();

    if (error) {
      this.logger.error(`Tạo bình luận thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không lưu được bình luận');
    }

    const boardId = (card.lists as unknown as { board_id: string } | null)?.board_id;
    if (boardId) {
      await this.activity.record(
        boardId,
        userUid,
        'comment_added',
        `Đã bình luận vào thẻ "${card.title}"`,
        cardId,
      );
    }

    return data;
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
