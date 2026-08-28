import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AccessService } from '../../common/access/access.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { TaskSuggestionsService } from '../task-suggestions/task-suggestions.service';

/** Số tin mỗi trang khi client không nói gì. Khung chat ~300px hiện được 10–15
 *  tin mỗi màn, nên 10 là chưa đầy một màn — mốc canh ở đầu danh sách sẽ tự bắn
 *  thêm vài lượt cho tới khi đầy, và đó là hành vi mong muốn. */
const TRANG_MAC_DINH = 10;

/** Trần cứng: `?limit=100000` không được biến thành "tải cả lịch sử". */
const TRANG_TOI_DA = 50;

/** Cột luôn lấy. Gom một chỗ để `findAll` và `create` trả CÙNG MỘT hình dạng. */
const COT =
  'id, org_id, board_id, user_id, content, created_at, edited_at, deleted_at, reply_to_id, users(display_name, avatar_url)';

/** Khối `users(...)` mà Supabase join kèm — vẫn là snake_case của database. */
interface JoinedUserRow {
  display_name: string | null;
  avatar_url: string | null;
}

interface NguoiGui {
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * Trích dẫn hiện trong ô "đang trả lời" — CHỈ nội dung, không mang theo trích
 * dẫn của chính nó.
 *
 * Đây là chỗ chặn việc lồng vô hạn: A trả lời B, C trả lời A, D trả lời C…
 * Nếu kiểu này có thêm trường `replyTo` thì mỗi tin kéo theo cả một chuỗi tổ
 * tiên, và khung chat 300px vỡ ngay ở tầng thứ ba.
 */
interface TrichDan {
  id: string;
  userId: string;
  /** Rỗng khi đã thu hồi. */
  content: string;
  deletedAt: string | null;
  user: NguoiGui | null;
}

/** Hình dạng DUY NHẤT của một tin nhắn khi ra khỏi backend — dùng cho cả
 *  `GET /chat`, `POST /chat`, lẫn payload WebSocket. Một hình dạng thì frontend
 *  chỉ cần MỘT hàm ánh xạ; hai hình dạng là hai chỗ phải nhớ sửa song song. */
export interface TinNhanRa {
  id: string;
  orgId: string;
  boardId: string;
  userId: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  replyToId: string | null;
  replyTo: TrichDan | null;
  user: NguoiGui | null;
}

function toUser(row: unknown): NguoiGui | null {
  const u = row as JoinedUserRow | null;
  if (!u) return null;
  return {
    displayName: u.display_name ?? null,
    avatarUrl: u.avatar_url ?? null,
  };
}

/**
 * Tin đã thu hồi thì KHÔNG mang nội dung ra khỏi backend.
 *
 * Trả nội dung rồi để giao diện tự ẩn là ẩn giả: mở tab Network là đọc được
 * nguyên văn thứ người ta vừa thu hồi.
 */
function noiDung(row: { content: string; deleted_at: string | null }): string {
  return row.deleted_at ? '' : row.content;
}

/** Con trỏ phân trang: `<created_at>_<id>`. */
export function docConTro(cursor: string): { at: string; id: string } {
  const cat = cursor.lastIndexOf('_');
  if (cat <= 0)
    throw new BadRequestException('Con trỏ phân trang không hợp lệ.');
  return { at: cursor.slice(0, cat), id: cursor.slice(cat + 1) };
}

export function taoConTro(m: { createdAt: string; id: string }): string {
  return `${m.createdAt}_${m.id}`;
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

  /**
   * Một TRANG tin nhắn, mới nhất trước, trả về theo thứ tự cũ → mới để vẽ thẳng.
   *
   * ── Vì sao con trỏ khoá chứ không phải OFFSET?
   * Chat là danh sách đang chảy. Với `OFFSET 10` mà trong lúc người dùng cuộn có
   * 2 tin mới chen vào đầu, trang sau sẽ lặp lại 2 tin đã đọc. Ngược lại, xoá
   * tin thì trang sau nhảy cóc bỏ sót. Con trỏ khoá neo vào MỘT DÒNG CỤ THỂ nên
   * miễn nhiễm với cả hai.
   *
   * `id` đi kèm `created_at` để tách hai tin trùng mốc tới từng mili giây —
   * thiếu nó thì hai tin gửi cùng thời điểm sẽ lặp hoặc mất khi qua trang.
   */
  async findAll(
    uid: string,
    boardId: string,
    before?: string,
    limit?: number,
  ): Promise<{ messages: TinNhanRa[]; hasMore: boolean }> {
    if (!boardId) return { messages: [], hasMore: false };
    await this.access.assertBoardAccess(uid, boardId);
    const sb = this.supabase.client;

    const n = Math.min(
      Math.max(Number(limit) || TRANG_MAC_DINH, 1),
      TRANG_TOI_DA,
    );

    let q = sb
      .from('messages')
      .select(COT)
      .eq('board_id', boardId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      // Lấy dư MỘT dòng để biết còn trang nữa không, thay vì phải chạy thêm một
      // câu `count` riêng cho mỗi lần cuộn.
      .limit(n + 1);

    if (before) {
      const { at, id } = docConTro(before);
      q = q.or(
        `created_at.lt."${at}",and(created_at.eq."${at}",id.lt."${id}")`,
      );
    }

    const { data, error } = await q;
    if (error) {
      this.logger.error(`Đọc tin nhắn thất bại: ${error.message}`);
      throw new InternalServerErrorException('Failed to load messages');
    }

    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    const hasMore = rows.length > n;
    const trang = (hasMore ? rows.slice(0, n) : rows).reverse(); // cũ → mới

    return { messages: await this.gan(trang), hasMore };
  }

  /**
   * Gắn ô trích dẫn cho một loạt tin, bằng ĐÚNG MỘT câu truy vấn phụ.
   *
   * Không dùng self-join của PostgREST (`messages!reply_to_id(...)`): cú pháp
   * gợi ý khoá ngoại rất kén khi một bảng có nhiều đường tự tham chiếu, còn
   * `in (...)` thì đọc hiểu ngay và chắc chắn chạy. Một trang 10 tin thì thêm
   * một lượt hỏi là không đáng kể.
   *
   * Có phân trang rồi thì frontend KHÔNG tự tra được nữa — tin gốc hoàn toàn có
   * thể nằm ngoài các trang đã tải.
   */
  private async gan(rows: Record<string, unknown>[]): Promise<TinNhanRa[]> {
    const idGoc = [
      ...new Set(
        rows
          .map((r) => r.reply_to_id as string | null)
          .filter((x): x is string => !!x),
      ),
    ];

    const trichDan = new Map<string, TrichDan>();
    if (idGoc.length) {
      const { data } = await this.supabase.client
        .from('messages')
        .select(
          'id, user_id, content, deleted_at, users(display_name, avatar_url)',
        )
        .in('id', idGoc);

      for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
        trichDan.set(r.id as string, {
          id: r.id as string,
          userId: r.user_id as string,
          content: noiDung(r as never),
          deletedAt: (r.deleted_at as string) ?? null,
          user: toUser(r.users),
        });
      }
    }

    return rows.map((r) => this.raNgoai(r, trichDan));
  }

  private raNgoai(
    r: Record<string, unknown>,
    trichDan?: Map<string, TrichDan>,
  ): TinNhanRa {
    const replyToId = (r.reply_to_id as string) ?? null;
    return {
      id: r.id as string,
      orgId: r.org_id as string,
      boardId: r.board_id as string,
      // userId là BẮT BUỘC: frontend cần nó để biết tin nào của mình (căn
      // trái/phải) — chỉ có display_name thì hai người trùng tên là hiển thị sai.
      userId: r.user_id as string,
      content: noiDung(r as never),
      createdAt: r.created_at as string,
      editedAt: (r.edited_at as string) ?? null,
      deletedAt: (r.deleted_at as string) ?? null,
      replyToId,
      replyTo: replyToId ? (trichDan?.get(replyToId) ?? null) : null,
      user: toUser(r.users),
    };
  }

  async create(
    boardId: string,
    userUid: string,
    content: string,
    replyToId?: string,
  ): Promise<TinNhanRa> {
    const { orgId } = await this.access.assertBoardAccess(userUid, boardId);
    const sb = this.supabase.client;

    if (replyToId) await this.kiemTraTinDuocTraLoi(replyToId, boardId);

    const { data, error } = await sb
      .from('messages')
      .insert({
        board_id: boardId,
        org_id: orgId,
        user_id: userUid,
        content,
        reply_to_id: replyToId ?? null,
      })
      .select(COT)
      .single();

    if (error) {
      this.logger.error(`Gửi tin nhắn thất bại: ${error.message}`);
      throw new InternalServerErrorException('Failed to send message');
    }

    const [created] = await this.gan([data]);

    // Đây là lý do chính khiến dự án cần WebSocket: chat mà phải F5 mới thấy tin
    // của người khác thì không gọi là chat được.
    this.realtime.emitToBoard(boardId, 'chat.message', userUid, created);

    // Đưa tin nhắn đi phân tích — KHÔNG `await`.
    //
    // ⚠️ Gửi tin nhắn phải trả về NGAY. Chờ Gemini (1–3 giây) trước khi trả lời
    //    là biến khung chat thành thứ giật cục vì một tính năng phụ. Gợi ý xuất
    //    hiện sau đó qua WebSocket. `analyze()` tự nuốt mọi lỗi bên trong.
    void this.suggestions.analyze({
      id: created.id,
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
   * Tin được trả lời PHẢI thuộc đúng board này.
   *
   * ⚠️ Không kiểm thì gửi kèm id của một tin ở board tổ chức khác là backend
   *    ngoan ngoãn đi lấy nội dung tin đó và nhét vào ô trích dẫn của board
   *    này — rò nội dung sang nơi người xem không có quyền.
   */
  private async kiemTraTinDuocTraLoi(
    replyToId: string,
    boardId: string,
  ): Promise<void> {
    const { data } = await this.supabase.client
      .from('messages')
      .select('id')
      .eq('id', replyToId)
      .eq('board_id', boardId)
      .maybeSingle();
    if (!data) {
      throw new BadRequestException(
        'Tin nhắn được trả lời không tồn tại trong board này.',
      );
    }
  }

  /** Sửa nội dung. Chỉ người gửi, và tin đã thu hồi thì thôi. */
  async update(uid: string, id: string, content: string): Promise<TinNhanRa> {
    const cu = await this.layDeSua(uid, id);
    if (cu.deleted_at) {
      throw new BadRequestException('Tin nhắn đã thu hồi thì không sửa được.');
    }

    const { data, error } = await this.supabase.client
      .from('messages')
      .update({ content, edited_at: new Date().toISOString() })
      .eq('id', id)
      .select(COT)
      .single();
    if (error) {
      this.logger.error(`Sửa tin nhắn thất bại: ${error.message}`);
      throw new InternalServerErrorException('Failed to edit message');
    }

    return this.phatCapNhat(data, uid);
  }

  /**
   * Thu hồi.
   *
   * Đánh dấu chứ KHÔNG xoá dòng: xoá thì `reply_to_id` của mọi câu trả lời
   * thành NULL và ô trích dẫn mất sạch ngữ cảnh. Giữ dòng thì ô đó vẫn hiện
   * được "Tin nhắn đã được thu hồi".
   */
  async recall(uid: string, id: string): Promise<TinNhanRa> {
    const cu = await this.layDeSua(uid, id);
    if (cu.deleted_at) {
      // Thu hồi hai lần không phải lỗi — kết quả vẫn đúng như người dùng muốn.
      return this.phatCapNhat(cu, uid);
    }

    const { data, error } = await this.supabase.client
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select(COT)
      .single();
    if (error) {
      this.logger.error(`Thu hồi tin nhắn thất bại: ${error.message}`);
      throw new InternalServerErrorException('Failed to recall message');
    }

    return this.phatCapNhat(data, uid);
  }

  /** Lấy tin + kiểm quyền: phải xem được board VÀ phải là người gửi. */
  private async layDeSua(
    uid: string,
    id: string,
  ): Promise<Record<string, unknown>> {
    const { data } = await this.supabase.client
      .from('messages')
      .select(COT)
      .eq('id', id)
      .maybeSingle();
    if (!data) throw new NotFoundException('Message not found.');

    const row = data as unknown as Record<string, unknown>;
    await this.access.assertBoardAccess(uid, row.board_id as string);

    // Kiểm ở SERVER, không phải chỉ ẩn nút ở giao diện.
    if (row.user_id !== uid) {
      throw new ForbiddenException('Chỉ người gửi mới sửa hoặc thu hồi được.');
    }
    return row;
  }

  /**
   * Phát `chat.message.updated` cho cả board.
   *
   * Dùng chung cho SỬA và THU HỒI vì cả hai đều chỉ là "dòng này vừa đổi".
   * Không có sự kiện này thì máy người khác vẫn hiện nội dung cũ tới khi F5.
   */
  private async phatCapNhat(
    row: Record<string, unknown>,
    actorUid: string,
  ): Promise<TinNhanRa> {
    const [ra] = await this.gan([row]);
    this.realtime.emitToBoard(ra.boardId, 'chat.message.updated', actorUid, ra);
    return ra;
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
