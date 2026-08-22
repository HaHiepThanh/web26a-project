import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

/** [AI-CHAT] Tin nhắn chat theo board (cần bảng messages). */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async findAll(boardId: string): Promise<unknown[]> {
    const sb = this.supabase.client;

    const { data, error } = await sb
      .from('messages')
      .select('id, content, created_at, users(display_name, avatar_url)')
      .eq('board_id', boardId)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(`Đọc tin nhắn thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không đọc được tin nhắn');
    }

    return data.map((m) => ({
      id: m.id,
      content: m.content,
      createdAt: m.created_at,
      user: m.users,
    }));
  }

  async create(boardId: string, userUid: string, content: string): Promise<unknown> {
    const sb = this.supabase.client;

    const { data: board } = await sb
      .from('boards')
      .select('id, org_id')
      .eq('id', boardId)
      .maybeSingle();

    if (!board) throw new NotFoundException('Không tìm thấy board.');

    const { data, error } = await sb
      .from('messages')
      .insert({ board_id: boardId, org_id: board.org_id, user_id: userUid, content })
      .select()
      .single();

    if (error) {
      this.logger.error(`Gửi tin nhắn thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không gửi được tin nhắn');
    }

    return data;
  }
}
