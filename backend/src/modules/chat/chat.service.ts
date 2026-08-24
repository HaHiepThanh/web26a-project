import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { AccessService } from '../../common/access/access.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { TaskSuggestionsService } from '../task-suggestions/task-suggestions.service';

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

/** [AI-CHAT] Tin nhắn chat theo board (cần bảng messages). */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly realtime: RealtimeGateway,
    private readonly suggestions: TaskSuggestionsService,
    private readonly access: AccessService,
  ) {}

  async findAll(uid: string, boardId: string): Promise<unknown[]> {
    if (!boardId) return [];
    await this.access.assertBoardAccess(uid, boardId);
    const sb = this.supabase.client;

    const { data, error } = await sb
      .from('messages')
      .select(
        'id, user_id, content, created_at, users(display_name, avatar_url)',
      )
      .eq('board_id', boardId)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(`Đọc tin nhắn thất bại: ${error.message}`);
      throw new InternalServerErrorException('Failed to load messages');
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

  async create(
    boardId: string,
    userUid: string,
    content: string,
  ): Promise<unknown> {
    const { orgId } = await this.access.assertBoardAccess(userUid, boardId);
    const sb = this.supabase.client;

    const { data, error } = await sb
      .from('messages')
      .insert({ board_id: boardId, org_id: orgId, user_id: userUid, content })
      .select()
      .single();

    if (error) {
      this.logger.error(`Gửi tin nhắn thất bại: ${error.message}`);
      throw new InternalServerErrorException('Failed to send message');
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

    // Đưa tin nhắn đi phân tích — KHÔNG `await`.
    //
    // ⚠️ Gửi tin nhắn phải trả về NGAY. Chờ Gemini (1–3 giây) trước khi trả lời
    //    là biến khung chat thành thứ giật cục vì một tính năng phụ. Gợi ý xuất
    //    hiện sau đó qua WebSocket. `analyze()` tự nuốt mọi lỗi bên trong.
    void this.suggestions.analyze({
      id: row.id as string,
      orgId,
      boardId,
      userId: userUid,
      content,
    });

    return created;
  }
}
