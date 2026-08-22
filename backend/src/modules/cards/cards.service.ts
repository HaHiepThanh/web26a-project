import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { ActivityService } from '../activity/activity.service';
import { UpdateCardDto } from './dto/update-card.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';

/** Postgres báo mã này khi nhận chuỗi không phải uuid vào cột kiểu uuid. */
const LOI_UUID_SAI = '22P02';
function laUuidSai(error: { code?: string } | null): boolean {
  return error?.code === LOI_UUID_SAI;
}

/** Dòng thô Supabase trả về (tên cột snake_case). */
interface CardRow {
  id: string;
  org_id: string;
  list_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  due_date: string | null;
  priority: string;
  completed_at: string | null;
  position: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Hình dạng API trả ra ngoài — camelCase, thống nhất với phần của Huy và Hoà. */
export interface CardResponse {
  id: string;
  orgId: string;
  listId: string;
  title: string;
  description: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  priority: string;
  completedAt: string | null;
  position: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

function toCard(row: CardRow): CardResponse {
  return {
    id: row.id,
    orgId: row.org_id,
    listId: row.list_id,
    title: row.title,
    description: row.description,
    assigneeId: row.assignee_id,
    dueDate: row.due_date,
    priority: row.priority,
    completedAt: row.completed_at,
    position: row.position,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** CRUD card + kéo thả giữa/trong list (#4). */
@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Board nào chứa cột này? Bảng `cards` chỉ có `list_id`, không có `board_id` —
   * mà phòng WebSocket lại đặt tên theo board, nên phải tra thêm một bước.
   * Trả '' khi không tra được: `emitToBoard` bỏ qua boardId rỗng, việc phát tin
   * hỏng không được làm hỏng thao tác chính.
   */
  private async boardIdOfList(listId: string): Promise<string> {
    const { data } = await this.supabase.client
      .from('lists')
      .select('board_id')
      .eq('id', listId)
      .maybeSingle();
    return (data?.board_id as string) ?? '';
  }

  /**
   * Người gọi có thuộc tổ chức này không? Không thuộc → 404.
   *
   * ⚠️ Backend dùng service_role key nên RLS bị bỏ qua — database KHÔNG chặn gì.
   *    Thiếu hàm này thì bất kỳ ai đăng nhập cũng đọc/sửa/xoá được thẻ của mọi
   *    công ty khác, chỉ cần đoán đúng id.
   */
  private async assertOrgMember(uid: string, orgId: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('organization_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', uid)
      .maybeSingle();
    if (error) {
      this.logger.error(`Kiểm tra quyền thất bại (uid=${uid}, org=${orgId}): ${error.message}`);
      throw new InternalServerErrorException('Không kiểm tra được quyền');
    }
    // 404 chứ không phải 403: trả 403 là vô tình xác nhận "id này có thật".
    if (!data) throw new NotFoundException('Không tìm thấy dữ liệu.');
  }

  /** Tìm board và xác nhận người gọi được phép đụng vào nó. */
  private async assertBoardAccess(uid: string, boardId: string): Promise<void> {
    const { data: board, error } = await this.supabase.client
      .from('boards')
      .select('id, org_id')
      .eq('id', boardId)
      .maybeSingle();
    if (error) {
      if (laUuidSai(error)) throw new NotFoundException('Không tìm thấy board.');
      throw new InternalServerErrorException('Không đọc được board');
    }
    if (!board) throw new NotFoundException('Không tìm thấy board.');
    await this.assertOrgMember(uid, board.org_id as string);
  }

  /** Tìm thẻ và xác nhận người gọi được phép đụng vào nó. */
  private async assertCardAccess(uid: string, cardId: string): Promise<CardRow> {
    const { data: card, error } = await this.supabase.client
      .from('cards')
      .select('*')
      .eq('id', cardId)
      .maybeSingle();
    if (error) {
      if (laUuidSai(error)) throw new NotFoundException('Không tìm thấy thẻ.');
      throw new InternalServerErrorException('Không đọc được thẻ');
    }
    if (!card) throw new NotFoundException('Không tìm thấy thẻ.');
    await this.assertOrgMember(uid, (card as CardRow).org_id);
    return card as CardRow;
  }

  /** Toàn bộ thẻ của 1 board. `cards` không có board_id nên phải đi vòng qua `lists`. */
  async findAll(uid: string, boardId: string): Promise<CardResponse[]> {
    if (!boardId) return [];
    await this.assertBoardAccess(uid, boardId);

    const sb = this.supabase.client;
    const { data: lists } = await sb.from('lists').select('id').eq('board_id', boardId);
    if (!lists?.length) return [];

    const { data, error } = await sb
      .from('cards')
      .select('*')
      .in(
        'list_id',
        lists.map((l) => l.id),
      )
      .order('position', { ascending: true });

    if (error) {
      this.logger.error(`Đọc danh sách thẻ thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không đọc được danh sách thẻ');
    }
    return (data as CardRow[]).map(toCard);
  }

  async create(listId: string, title: string, uid: string): Promise<CardResponse> {
    const sb = this.supabase.client;

    const { data: list, error: listError } = await sb
      .from('lists')
      .select('id, org_id, board_id')
      .eq('id', listId)
      .maybeSingle();
    if (listError && laUuidSai(listError)) throw new NotFoundException('Không tìm thấy cột.');
    if (!list) throw new NotFoundException('Không tìm thấy cột.');

    await this.assertOrgMember(uid, list.org_id as string);

    const { data: last } = await sb
      .from('cards')
      .select('position')
      .eq('list_id', listId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();

    const position = last ? last.position + 1 : 1;

    const { data, error } = await sb
      .from('cards')
      .insert({ org_id: list.org_id, list_id: listId, title, position, created_by: uid })
      .select()
      .single();

    if (error) {
      this.logger.error(`Tạo thẻ thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không tạo được thẻ');
    }

    await this.activity.record(
      list.board_id as string,
      uid,
      'card_created',
      `Đã tạo thẻ "${title}"`,
      (data as CardRow).id,
    );
    const created = toCard(data as CardRow);
    this.realtime.emitToBoard(list.board_id as string, 'card.created', uid, created);
    return created;
  }

  async update(uid: string, id: string, changes: UpdateCardDto): Promise<CardResponse> {
    const truoc = await this.assertCardAccess(uid, id);
    const truocKhiSua = truoc.assignee_id;

    const patch: Record<string, unknown> = {};
    if (changes.title !== undefined) patch.title = changes.title;
    if (changes.description !== undefined) patch.description = changes.description;
    if (changes.priority !== undefined) patch.priority = changes.priority;
    if (changes.dueDate !== undefined) patch.due_date = changes.dueDate;
    if (changes.assigneeId !== undefined) patch.assignee_id = changes.assigneeId;

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('Không có gì để cập nhật.');
    }

    const { data, error } = await this.supabase.client
      .from('cards')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Cập nhật thẻ thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không cập nhật được thẻ');
    }
    const updated = toCard(data as CardRow);
    const boardId = await this.boardIdOfList(updated.listId);
    this.realtime.emitToBoard(boardId, 'card.updated', uid, updated);

    // Vừa GIAO việc cho người khác → báo riêng cho đúng người đó.
    // Chỉ báo khi assignee THỰC SỰ đổi, và không tự báo cho chính mình.
    if (updated.assigneeId && updated.assigneeId !== uid && updated.assigneeId !== truocKhiSua) {
      await this.baoDuocGiaoViec(uid, updated, boardId);
    }
    return updated;
  }

  /**
   * Gửi thông báo "bạn được giao thẻ X" tới đúng người được giao.
   *
   * Gom sẵn tên board + tên workspace + slug tổ chức vào payload để client bấm
   * một cái là đi thẳng tới `/:orgSlug/board/:id` — không phải gọi thêm 3 API
   * chỉ để dựng được một dòng thông báo.
   *
   * Không `await` kết quả ở chỗ gọi và nuốt mọi lỗi: đây là việc phụ, hỏng thì
   * cũng không được làm hỏng thao tác gán việc mà người dùng vừa làm.
   */
  private async baoDuocGiaoViec(
    actorUid: string,
    card: CardResponse,
    boardId: string,
  ): Promise<void> {
    try {
      const sb = this.supabase.client;
      const [{ data: board }, { data: actor }] = await Promise.all([
        sb
          .from('boards')
          .select('id, name, workspaces(name), organizations(slug)')
          .eq('id', boardId)
          .maybeSingle(),
        sb.from('users').select('display_name, email').eq('id', actorUid).maybeSingle(),
      ]);

      this.realtime.emitToUser(card.assigneeId as string, 'card.assigned', actorUid, {
        cardId: card.id,
        cardTitle: card.title,
        boardId,
        boardName: (board?.name as string) ?? '',
        workspaceName:
          ((board?.workspaces as unknown as { name: string } | null)?.name as string) ?? '',
        orgSlug:
          ((board?.organizations as unknown as { slug: string } | null)?.slug as string) ?? '',
        byUserName: (actor?.display_name as string) || (actor?.email as string) || 'Ai đó',
      });
    } catch (e) {
      this.logger.warn(`Không gửi được thông báo giao việc: ${(e as Error).message}`);
    }
  }

  async move(id: string, toListId: string, position: number, uid: string): Promise<CardResponse> {
    const card = await this.assertCardAccess(uid, id);

    const { data: toList, error: toListError } = await this.supabase.client
      .from('lists')
      .select('id, org_id, board_id')
      .eq('id', toListId)
      .maybeSingle();
    if (toListError && laUuidSai(toListError)) {
      throw new NotFoundException('Không tìm thấy cột đích.');
    }
    if (!toList) throw new NotFoundException('Không tìm thấy cột đích.');

    // Không có dòng này thì kéo được thẻ sang board của công ty khác.
    if (toList.org_id !== card.org_id) {
      throw new ForbiddenException('Không thể chuyển thẻ sang tổ chức khác.');
    }

    const { data, error } = await this.supabase.client
      .from('cards')
      .update({ list_id: toListId, position })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Chuyển thẻ thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không chuyển được thẻ');
    }

    await this.activity.record(
      toList.board_id as string,
      uid,
      'card_moved',
      `Đã chuyển thẻ "${card.title}"`,
      id,
    );

    const moved = toCard(data as CardRow);
    // Kéo thẻ sang board khác đã bị chặn ở trên, nên board cũ và mới luôn giống
    // nhau — chỉ cần phát 1 lần vào board đích.
    this.realtime.emitToBoard(toList.board_id as string, 'card.moved', uid, moved);
    return moved;
  }

  async remove(uid: string, id: string): Promise<void> {
    const card = await this.assertCardAccess(uid, id);
    // Tra board TRƯỚC khi xoá: xoá xong thì không còn dòng nào để lần ra list nữa.
    const boardId = await this.boardIdOfList(card.list_id);

    const { error } = await this.supabase.client.from('cards').delete().eq('id', id);
    if (error) {
      this.logger.error(`Xoá thẻ thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không xoá được thẻ');
    }
    this.realtime.emitToBoard(boardId, 'card.deleted', uid, { id, listId: card.list_id });
  }
}
