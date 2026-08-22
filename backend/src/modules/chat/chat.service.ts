import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
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
function toUser(row: unknown): { displayName: string | null; avatarUrl: string | null } | null {
  const u = row as JoinedUserRow | null;
  if (!u) return null;
  return { displayName: u.display_name ?? null, avatarUrl: u.avatar_url ?? null };
}

/** [AI-CHAT] Tin nhắn chat theo board (cần bảng messages). */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Người gọi có được đụng vào board này không? Không thì 404.
   *
   * ⚠️ Thiếu hàm này thì ai đăng nhập cũng đọc được toàn bộ chat nội bộ của mọi
   *    công ty khác, chỉ cần đoán đúng boardId.
   */
  private async assertBoardAccess(uid: string, boardId: string): Promise<string> {
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

    return board.org_id as string;
  }

  async findAll(uid: string, boardId: string): Promise<unknown[]> {
    if (!boardId) return [];
    await this.assertBoardAccess(uid, boardId);
    const sb = this.supabase.client;

    const { data, error } = await sb
      .from('messages')
      .select('id, user_id, content, created_at, users(display_name, avatar_url)')
      .eq('board_id', boardId)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(`Đọc tin nhắn thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không đọc được tin nhắn');
    }

    // userId là BẮT BUỘC: frontend cần nó để biết tin nào của mình (căn trái/phải)
    // — chỉ có display_name thì hai người trùng tên là hiển thị sai.
    return data.map((m) => ({
      id: m.id,
      userId: m.user_id,
      content: m.content,
      createdAt: m.created_at,
      user: toUser(m.users),
    }));
  }

  async create(boardId: string, userUid: string, content: string): Promise<unknown> {
    const orgId = await this.assertBoardAccess(userUid, boardId);
    const sb = this.supabase.client;

    const { data, error } = await sb
      .from('messages')
      .insert({ board_id: boardId, org_id: orgId, user_id: userUid, content })
      .select()
      .single();

    if (error) {
      this.logger.error(`Gửi tin nhắn thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không gửi được tin nhắn');
    }

    // Đổi sang camelCase cho khớp phần còn lại của API — đừng trả thẳng dòng Supabase.
    const row = data as Record<string, unknown>;
    const created = {
      id: row.id,
      orgId: row.org_id,
      boardId: row.board_id,
      userId: row.user_id,
      content: row.content,
      createdAt: row.created_at,
    };

    // Đây là lý do chính khiến dự án cần WebSocket: chat mà phải F5 mới thấy tin
    // của người khác thì không gọi là chat được.
    this.realtime.emitToBoard(boardId, 'chat.message', userUid, created);
    return created;
  }
}
