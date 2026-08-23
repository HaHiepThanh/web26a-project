import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { AccessService } from '../../common/access/access.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { GeminiService } from '../ai/gemini.service';
import { SuggestedCard } from '../ai/gemini.types';
import { CardsService } from '../cards/cards.service';

/** Số tin nhắn gần nhất gửi kèm làm ngữ cảnh — đủ để nối câu, không quá dài. */
const SO_TIN_NGU_CANH = 6;

/** Trần lượt gọi model cho MỘT board trong một phút, phòng ai đó spam chat. */
const TRAN_MOI_PHUT = 12;

export type SuggestionStatus = 'pending' | 'accepted' | 'dismissed';

export interface TaskSuggestionResponse {
  id: string;
  orgId: string;
  boardId: string;
  messageId: string;
  createdBy: string;
  status: SuggestionStatus;
  cards: SuggestedCard[];
  model: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

function toResponse(row: Record<string, unknown>): TaskSuggestionResponse {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    boardId: row.board_id as string,
    messageId: row.message_id as string,
    createdBy: row.created_by as string,
    status: (row.status as SuggestionStatus) ?? 'pending',
    cards: (row.cards as SuggestedCard[]) ?? [],
    model: (row.model as string) ?? null,
    createdAt: row.created_at as string,
    resolvedAt: (row.resolved_at as string) ?? null,
    resolvedBy: (row.resolved_by as string) ?? null,
  };
}

/**
 * Gợi ý tạo thẻ do AI phát hiện từ tin nhắn chat.
 *
 * Luồng: `POST /chat` lưu tin nhắn → gọi `analyze()` (KHÔNG await) → bộ lọc rẻ →
 * Gemini → lưu bảng `chat_task_suggestions` → phát WebSocket cho cả board.
 * Người dùng bấm xem, sửa trong modal, rồi `accept()` mới tạo thẻ thật.
 */
@Injectable()
export class TaskSuggestionsService {
  private readonly logger = new Logger(TaskSuggestionsService.name);

  /** boardId → các mốc thời gian đã gọi model, dùng cho trần mỗi phút. */
  private readonly nhipGoi = new Map<string, number[]>();

  constructor(
    private readonly supabase: SupabaseService,
    private readonly access: AccessService,
    private readonly realtime: RealtimeGateway,
    private readonly gemini: GeminiService,
    private readonly cards: CardsService,
  ) {}

  // ------------------------------------------------------------- phân tích

  /**
   * Phân tích một tin nhắn vừa gửi.
   *
   * ⚠️ Hàm này KHÔNG BAO GIỜ được ném lỗi ra ngoài. Nó chạy nền sau khi tin nhắn
   *    đã gửi xong; một lỗi ở đây mà làm vỡ luồng chat thì hỏng hẳn tính năng
   *    chính chỉ vì tính năng phụ.
   */
  async analyze(msg: {
    id: string;
    orgId: string;
    boardId: string;
    userId: string;
    content: string;
  }): Promise<void> {
    try {
      if (!this.gemini.enabled) return;
      if (!this.conNhipGoi(msg.boardId)) {
        this.logger.warn(`Bỏ phân tích: board ${msg.boardId} vượt trần ${TRAN_MOI_PHUT} lượt/phút`);
        return;
      }

      const { members, lists, recent, sender } = await this.thuThapNguCanh(msg);
      if (!members.length || !lists.length) return; // board rỗng thì tạo thẻ vào đâu

      // Bộ lọc rẻ chạy SAU khi có tên thành viên, để "Hoà ơi..." cũng tính là
      // một dấu hiệu dù không có ký tự @.
      if (!this.gemini.shouldAnalyze(msg.content, members.map((m) => m.displayName))) return;

      const ketQua = await this.gemini.detectTasks({
        content: msg.content,
        sender,
        recent,
        members,
        lists,
        today: homNayVN(),
      });
      if (!ketQua.isTask || !ketQua.cards.length) return;

      const { data, error } = await this.supabase.client
        .from('chat_task_suggestions')
        .insert({
          org_id: msg.orgId,
          board_id: msg.boardId,
          message_id: msg.id,
          created_by: msg.userId,
          cards: ketQua.cards,
          model: this.gemini.modelName,
        })
        .select()
        .single();

      if (error) {
        // 23505 = đã có gợi ý cho tin nhắn này (vd server phân tích lại sau khi
        // khởi động lại). Không phải lỗi, chỉ là không tạo thêm bản ghi.
        if (error.code !== '23505') {
          this.logger.error(`Lưu gợi ý thất bại: ${error.message}`);
        }
        return;
      }

      const goiY = toResponse(data as Record<string, unknown>);
      this.realtime.emitToBoard(msg.boardId, 'suggestion.created', msg.userId, goiY);
      this.logger.log(`Gợi ý ${ketQua.cards.length} thẻ từ tin nhắn ${msg.id}`);
    } catch (e) {
      this.logger.warn(`Phân tích tin nhắn thất bại: ${(e as Error).message}`);
    }
  }

  /** Còn lượt gọi trong phút này không? Cửa sổ trượt 60 giây, giữ trong bộ nhớ. */
  private conNhipGoi(boardId: string): boolean {
    const now = Date.now();
    const moc = (this.nhipGoi.get(boardId) ?? []).filter((t) => now - t < 60_000);
    if (moc.length >= TRAN_MOI_PHUT) {
      this.nhipGoi.set(boardId, moc);
      return false;
    }
    moc.push(now);
    this.nhipGoi.set(boardId, moc);
    return true;
  }

  /** Gom thành viên + cột + vài tin gần nhất + hồ sơ người gửi, chạy song song. */
  private async thuThapNguCanh(msg: { boardId: string; orgId: string; userId: string; id: string }) {
    const sb = this.supabase.client;
    const [thanhVienRes, cotRes, tinRes] = await Promise.all([
      sb.from('organization_members').select('user_id, users(display_name, email)').eq('org_id', msg.orgId),
      sb.from('lists').select('id, name').eq('board_id', msg.boardId).order('position'),
      sb
        .from('messages')
        .select('user_id, content, created_at, users(display_name, email)')
        .eq('board_id', msg.boardId)
        .neq('id', msg.id)
        .order('created_at', { ascending: false })
        .limit(SO_TIN_NGU_CANH),
    ]);

    type Joined = { display_name: string | null; email: string } | null;
    const ten = (u: unknown) => {
      const x = u as Joined;
      return x?.display_name || x?.email?.split('@')[0] || 'Ẩn danh';
    };

    const members = (thanhVienRes.data ?? []).map((r) => ({
      id: r.user_id as string,
      displayName: ten(r.users),
    }));

    return {
      members,
      lists: (cotRes.data ?? []).map((r) => ({ id: r.id as string, name: r.name as string })),
      // Đảo lại thành cũ → mới: model đọc theo trình tự thời gian mới nối được ngữ cảnh.
      recent: (tinRes.data ?? [])
        .reverse()
        .map((r) => ({ displayName: ten(r.users), content: r.content as string })),
      sender: {
        id: msg.userId,
        displayName: members.find((m) => m.id === msg.userId)?.displayName ?? 'Người gửi',
      },
    };
  }

  // ------------------------------------------------------------- đọc / trả lời

  /** Gợi ý còn đang chờ của 1 board — dùng để F5 không mất. */
  async findPending(uid: string, boardId: string): Promise<TaskSuggestionResponse[]> {
    if (!boardId) return [];
    await this.access.assertBoardAccess(uid, boardId);

    const { data, error } = await this.supabase.client
      .from('chat_task_suggestions')
      .select('*')
      .eq('board_id', boardId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(`Đọc gợi ý thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không đọc được danh sách gợi ý');
    }
    return (data as Record<string, unknown>[]).map(toResponse);
  }

  private async layGoiY(uid: string, id: string): Promise<TaskSuggestionResponse> {
    const { data, error } = await this.supabase.client
      .from('chat_task_suggestions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error?.code === '22P02' || !data) throw new NotFoundException('Không tìm thấy gợi ý.');

    const goiY = toResponse(data as Record<string, unknown>);
    await this.access.assertBoardAccess(uid, goiY.boardId);
    return goiY;
  }

  /**
   * Chấp nhận gợi ý → tạo thẻ thật.
   *
   * `cards` truyền vào là danh sách ĐÃ SỬA trong modal (người dùng đổi tên, đổi
   * người phụ trách, bỏ bớt thẻ). Không dùng lại `cards` lưu trong database, vì
   * đó mới là bản nháp của model.
   *
   * ⚠️ Đổi trạng thái TRƯỚC khi tạo thẻ. Hai người cùng bấm "Chấp nhận" thì người
   *    thứ hai phải nhận 409 và KHÔNG tạo ra bộ thẻ thứ hai. Tạo thẻ trước rồi
   *    mới đổi trạng thái là để hở đúng khoảng thời gian đó.
   */
  async accept(uid: string, id: string, cards: SuggestedCard[]): Promise<{ createdCardIds: string[] }> {
    const goiY = await this.layGoiY(uid, id);
    if (goiY.status !== 'pending') {
      throw new ConflictException('Gợi ý này đã được xử lý rồi.');
    }
    if (!cards.length) {
      throw new ConflictException('Không có thẻ nào được chọn để tạo.');
    }

    const { data: chiem, error: chiemError } = await this.supabase.client
      .from('chat_task_suggestions')
      .update({ status: 'accepted', resolved_at: new Date().toISOString(), resolved_by: uid })
      .eq('id', id)
      .eq('status', 'pending') // ⚠️ chốt chống đua: chỉ đổi được nếu vẫn đang chờ
      .select();

    if (chiemError) {
      this.logger.error(`Cập nhật gợi ý thất bại: ${chiemError.message}`);
      throw new InternalServerErrorException('Không cập nhật được gợi ý');
    }
    // Không khớp dòng nào = người khác vừa xử lý xong trong tích tắc.
    if (!chiem || chiem.length === 0) {
      throw new ConflictException('Gợi ý này vừa được người khác xử lý.');
    }

    // Tạo thẻ qua CardsService — ăn theo luôn phần kiểm tra quyền, ghi nhật ký
    // 'card_created' và sự kiện WebSocket 'card.created' đã có sẵn ở đó.
    const createdCardIds: string[] = [];
    for (const c of cards) {
      if (!c.title?.trim() || !c.listId) continue;
      try {
        const the = await this.cards.create(c.listId, c.title.trim(), uid);
        createdCardIds.push(the.id);

        const patch: Record<string, unknown> = {};
        if (c.description) patch.description = c.description;
        if (c.assigneeId) patch.assigneeId = c.assigneeId;
        if (c.dueDate) patch.dueDate = c.dueDate;
        if (c.priority && c.priority !== 'medium') patch.priority = c.priority;
        if (Object.keys(patch).length) await this.cards.update(uid, the.id, patch);
      } catch (e) {
        // Một thẻ hỏng không được kéo theo cả nhóm — những thẻ trước đó đã tạo rồi.
        this.logger.warn(`Không tạo được thẻ "${c.title}": ${(e as Error).message}`);
      }
    }

    this.realtime.emitToBoard(goiY.boardId, 'suggestion.resolved', uid, {
      id,
      status: 'accepted',
      createdCardIds,
    });
    return { createdCardIds };
  }

  async dismiss(uid: string, id: string): Promise<{ id: string; status: 'dismissed' }> {
    const goiY = await this.layGoiY(uid, id);
    if (goiY.status !== 'pending') {
      throw new ConflictException('Gợi ý này đã được xử lý rồi.');
    }

    const { error } = await this.supabase.client
      .from('chat_task_suggestions')
      .update({ status: 'dismissed', resolved_at: new Date().toISOString(), resolved_by: uid })
      .eq('id', id)
      .eq('status', 'pending');

    if (error) {
      this.logger.error(`Bỏ qua gợi ý thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không bỏ qua được gợi ý');
    }

    this.realtime.emitToBoard(goiY.boardId, 'suggestion.resolved', uid, { id, status: 'dismissed' });
    return { id, status: 'dismissed' };
  }
}

/**
 * Hôm nay theo GIỜ VIỆT NAM, dạng 'YYYY-MM-DD'.
 *
 * Không dùng `new Date().toISOString()` được: nó cho giờ UTC, mà từ 0h đến 7h
 * sáng giờ Việt Nam thì UTC vẫn đang ở NGÀY HÔM TRƯỚC — nhắn "xong trong hôm nay"
 * lúc 1h sáng sẽ ra hạn của hôm qua.
 */
function homNayVN(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
