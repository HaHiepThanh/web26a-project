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

    // @nhắc tên → báo chuông. Cũng KHÔNG `await`: tin nhắn đã lưu và đã phát đi
    // rồi, thông báo hỏng không được làm hỏng việc gửi tin.
    void this.baoNhacTen(userUid, boardId, content);

    return created;
  }

  /**
   * Tìm người bị @nhắc trong tin nhắn rồi báo chuông cho họ.
   *
   * Đối chiếu với tên hiển thị của NGƯỜI XEM ĐƯỢC BOARD, không phải toàn bộ
   * người dùng: `@Huy` chỉ nên chạm tới Huy trong nhóm này, không phải mọi Huy
   * trong hệ thống.
   *
   * ⚠️ Xếp tên DÀI TRƯỚC khi ghép biểu thức. Có "An" và "An Huy" mà để "An"
   *    trước thì `@An Huy` khớp ngay "An" rồi dừng — báo nhầm người. Đây cũng
   *    là cách `message-item.ts` bên frontend tô màu @nhắc, giữ cho hai bên
   *    hiểu giống nhau.
   *
   * Không tự báo cho chính mình: tự @tên mình không phải là được nhắc.
   */
  private async baoNhacTen(
    actorUid: string,
    boardId: string,
    content: string,
  ): Promise<void> {
    try {
      if (!content.includes('@')) return;

      const { uids, boardName, orgSlug } =
        await this.access.nguoiXemDuocBoard(boardId);
      const khac = uids.filter((u) => u !== actorUid);
      if (!khac.length) return;

      const { data: users } = await this.supabase.client
        .from('users')
        .select('id, display_name, email')
        .in('id', [...khac, actorUid]);

      const dsUser = (users ?? []) as {
        id: string;
        display_name: string | null;
        email: string | null;
      }[];
      const tenActor =
        dsUser.find((u) => u.id === actorUid)?.display_name ||
        dsUser.find((u) => u.id === actorUid)?.email ||
        'Someone';

      const thap = content.toLowerCase();
      const daBao = new Set<string>();

      const ungVien = dsUser
        .filter((u) => khac.includes(u.id))
        .flatMap((u) =>
          [u.display_name, u.email]
            .filter((t): t is string => !!t && t.trim().length > 0)
            .map((ten) => ({ uid: u.id, ten: ten.trim().toLowerCase() })),
        )
        .sort((a, b) => b.ten.length - a.ten.length);

      for (const { uid, ten } of ungVien) {
        if (daBao.has(uid)) continue;
        if (!thap.includes('@' + ten)) continue;
        daBao.add(uid);

        this.realtime.emitToUser(uid, 'chat.mention', actorUid, {
          boardId,
          boardName,
          orgSlug,
          byUserName: tenActor,
          // Cắt ngắn: chuông là chỗ liếc qua, không phải chỗ đọc cả đoạn.
          excerpt: content.length > 80 ? content.slice(0, 80) + '…' : content,
        });
      }
    } catch (e) {
      this.logger.warn(
        `Không báo được @nhắc tên (board=${boardId}): ${(e as Error).message}`,
      );
    }
  }
}
