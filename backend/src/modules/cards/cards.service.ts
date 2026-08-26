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

/** Một thẻ quá hạn của tôi, kèm đủ chỗ để bấm thẳng tới nơi nó nằm. */
export interface OverdueCardResponse {
  cardId: string;
  title: string;
  dueDate: string;
  daysOverdue: number;
  boardId: string;
  boardName: string;
  workspaceName: string;
  orgSlug: string;
}

/** CRUD card + kéo thả giữa/trong list (#4). */
@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeGateway,
    private readonly access: AccessService,
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

  /** Tìm thẻ và xác nhận người gọi được phép đụng vào nó. */
  private async assertCardAccess(
    uid: string,
    cardId: string,
  ): Promise<CardRow> {
    const { data: card, error } = await this.supabase.client
      .from('cards')
      .select('*')
      .eq('id', cardId)
      .maybeSingle();
    if (error) {
      if (laUuidSai(error)) throw new NotFoundException('Card not found.');
      throw new InternalServerErrorException('Failed to load card');
    }
    if (!card) throw new NotFoundException('Card not found.');
    // Bản dùng chung đi qua list → board → workspace → tổ chức, nên bắt được cả
    // board 'private' và workspace 'restricted'. Kiểm mỗi organization_members
    // như trước là người cùng tổ chức nhưng ngoài board vẫn sửa được thẻ.
    await this.access.assertCardAccess(uid, cardId);
    return card as CardRow;
  }

  /** Toàn bộ thẻ của 1 board. `cards` không có board_id nên phải đi vòng qua `lists`. */
  async findAll(uid: string, boardId: string): Promise<CardResponse[]> {
    if (!boardId) return [];
    await this.access.assertBoardAccess(uid, boardId);

    const sb = this.supabase.client;
    const { data: lists } = await sb
      .from('lists')
      .select('id')
      .eq('board_id', boardId);
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
      throw new InternalServerErrorException('Failed to load cards');
    }
    return (data as CardRow[]).map(toCard);
  }

  /**
   * Thẻ ĐANG QUÁ HẠN được giao cho tôi, gom từ MỌI board của MỌI tổ chức tôi ở.
   *
   * Vì sao phải có endpoint riêng thay vì để frontend tự lọc: frontend chỉ nạp
   * thẻ của board đang mở, nên nó chỉ biết thẻ quá hạn của đúng board đó — mà
   * board đó thì người dùng đang nhìn thấy rồi, báo thêm cũng bằng thừa. Cái
   * đáng báo là thẻ ở board họ KHÔNG mở.
   *
   * Trả kèm tên board / tên workspace / slug tổ chức để dòng thông báo nói rõ
   * thẻ nằm ở đâu và bấm vào đi thẳng được tới `/:orgSlug/board/:boardId`.
   */
  async findMyOverdue(uid: string): Promise<OverdueCardResponse[]> {
    const sb = this.supabase.client;

    // Chỉ lấy trong các tổ chức tôi còn là thành viên: bị mời ra khỏi tổ chức
    // rồi thì thẻ cũ không được phép hiện lên nữa, dù assignee_id vẫn là tôi.
    const { data: memberships, error: memberError } = await sb
      .from('organization_members')
      .select('org_id')
      .eq('user_id', uid);
    if (memberError) {
      this.logger.error(`Đọc tổ chức của user thất bại: ${memberError.message}`);
      throw new InternalServerErrorException('Failed to load organizations');
    }
    const orgIds = (memberships ?? []).map((m) => m.org_id as string);
    if (!orgIds.length) return [];

    // `due_date` là kiểu `date` nên so với hôm nay theo NGÀY, không theo giờ:
    // thẻ hạn hôm nay CHƯA phải quá hạn, chỉ từ hôm qua trở về trước mới tính.
    const homNay = new Date().toISOString().slice(0, 10);

    const { data, error } = await sb
      .from('cards')
      .select(
        'id, title, due_date, lists(board_id, boards(id, name, workspaces(name), organizations(slug)))',
      )
      .eq('assignee_id', uid)
      .in('org_id', orgIds)
      .is('completed_at', null) // đã xong thì trễ cũng không cần nhắc nữa
      .lt('due_date', homNay)
      .order('due_date', { ascending: true });

    if (error) {
      this.logger.error(`Đọc thẻ quá hạn thất bại: ${error.message}`);
      throw new InternalServerErrorException('Failed to load overdue cards');
    }

    type Row = {
      id: string;
      title: string;
      due_date: string;
      lists: {
        board_id: string;
        boards: {
          id: string;
          name: string;
          workspaces: { name: string } | null;
          organizations: { slug: string } | null;
        } | null;
      } | null;
    };

    const mocHomNay = Date.parse(homNay);
    return (data as unknown as Row[])
      .filter((r) => !!r.lists?.boards) // board đã xoá thì không có chỗ để bấm tới
      .map((r) => {
        const board = r.lists!.boards!;
        return {
          cardId: r.id,
          title: r.title,
          dueDate: r.due_date,
          daysOverdue: Math.max(
            1,
            Math.round((mocHomNay - Date.parse(r.due_date)) / 86_400_000),
          ),
          boardId: board.id,
          boardName: board.name,
          workspaceName: board.workspaces?.name ?? '',
          orgSlug: board.organizations?.slug ?? '',
        };
      });
  }

  async create(
    listId: string,
    title: string,
    uid: string,
  ): Promise<CardResponse> {
    const sb = this.supabase.client;

    const { data: list, error: listError } = await sb
      .from('lists')
      .select('id, org_id, board_id')
      .eq('id', listId)
      .maybeSingle();
    if (listError && laUuidSai(listError))
      throw new NotFoundException('List not found.');
    if (!list) throw new NotFoundException('List not found.');

    await this.access.assertBoardAccess(uid, list.board_id as string);

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
      .insert({
        org_id: list.org_id,
        list_id: listId,
        title,
        position,
        created_by: uid,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Tạo thẻ thất bại: ${error.message}`);
      throw new InternalServerErrorException('Failed to create card');
    }

    await this.activity.record(
      list.board_id as string,
      uid,
      'card_created',
      `Created card "${title}"`,
      (data as CardRow).id,
    );
    const created = toCard(data as CardRow);
    this.realtime.emitToBoard(
      list.board_id as string,
      'card.created',
      uid,
      created,
    );
    return created;
  }

  async update(
    uid: string,
    id: string,
    changes: UpdateCardDto,
  ): Promise<CardResponse> {
    const truoc = await this.assertCardAccess(uid, id);
    const truocKhiSua = truoc.assignee_id;

    const patch: Record<string, unknown> = {};
    if (changes.title !== undefined) patch.title = changes.title;
    if (changes.description !== undefined)
      patch.description = changes.description;
    if (changes.priority !== undefined) patch.priority = changes.priority;
    if (changes.dueDate !== undefined) patch.due_date = changes.dueDate;
    if (changes.assigneeId !== undefined)
      patch.assignee_id = changes.assigneeId;

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('Nothing to update.');
    }

    const { data, error } = await this.supabase.client
      .from('cards')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Cập nhật thẻ thất bại: ${error.message}`);
      throw new InternalServerErrorException('Failed to update card');
    }
    const updated = toCard(data as CardRow);
    const boardId = await this.boardIdOfList(updated.listId);
    this.realtime.emitToBoard(boardId, 'card.updated', uid, updated);

    // Vừa GIAO việc cho người khác → báo riêng cho đúng người đó.
    // Chỉ báo khi assignee THỰC SỰ đổi, và không tự báo cho chính mình.
    if (
      updated.assigneeId &&
      updated.assigneeId !== uid &&
      updated.assigneeId !== truocKhiSua
    ) {
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
        sb
          .from('users')
          .select('display_name, email')
          .eq('id', actorUid)
          .maybeSingle(),
      ]);

      this.realtime.emitToUser(
        card.assigneeId as string,
        'card.assigned',
        actorUid,
        {
          cardId: card.id,
          cardTitle: card.title,
          boardId,
          boardName: (board?.name as string) ?? '',
          workspaceName:
            ((board?.workspaces as unknown as { name: string } | null)
              ?.name as string) ?? '',
          orgSlug:
            ((board?.organizations as unknown as { slug: string } | null)
              ?.slug as string) ?? '',
          byUserName:
            (actor?.display_name as string) ||
            (actor?.email as string) ||
            'Someone',
        },
      );
    } catch (e) {
      this.logger.warn(
        `Không gửi được thông báo giao việc: ${(e as Error).message}`,
      );
    }
  }

  async move(
    id: string,
    toListId: string,
    position: number,
    uid: string,
  ): Promise<CardResponse> {
    const card = await this.assertCardAccess(uid, id);

    const { data: toList, error: toListError } = await this.supabase.client
      .from('lists')
      .select('id, org_id, board_id')
      .eq('id', toListId)
      .maybeSingle();
    if (toListError && laUuidSai(toListError)) {
      throw new NotFoundException('Destination list not found.');
    }
    if (!toList) throw new NotFoundException('Destination list not found.');

    // Không có dòng này thì kéo được thẻ sang board của công ty khác.
    if (toList.org_id !== card.org_id) {
      throw new ForbiddenException('Cannot move card to another organization.');
    }

    const { data, error } = await this.supabase.client
      .from('cards')
      .update({ list_id: toListId, position })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Chuyển thẻ thất bại: ${error.message}`);
      throw new InternalServerErrorException('Failed to move card');
    }

    await this.activity.record(
      toList.board_id as string,
      uid,
      'card_moved',
      `Moved card "${card.title}"`,
      id,
    );

    const moved = toCard(data as CardRow);
    // Kéo thẻ sang board khác đã bị chặn ở trên, nên board cũ và mới luôn giống
    // nhau — chỉ cần phát 1 lần vào board đích.
    this.realtime.emitToBoard(
      toList.board_id as string,
      'card.moved',
      uid,
      moved,
    );
    return moved;
  }

  async remove(uid: string, id: string): Promise<void> {
    const card = await this.assertCardAccess(uid, id);
    // Tra board TRƯỚC khi xoá: xoá xong thì không còn dòng nào để lần ra list nữa.
    const boardId = await this.boardIdOfList(card.list_id);

    const { error } = await this.supabase.client
      .from('cards')
      .delete()
      .eq('id', id);
    if (error) {
      this.logger.error(`Xoá thẻ thất bại: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete card');
    }
    this.realtime.emitToBoard(boardId, 'card.deleted', uid, {
      id,
      listId: card.list_id,
    });
  }
}
