import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { AccessService } from '../../common/access/access.service';

export interface SavedFilterResponse {
  id: string;
  boardId: string;
  name: string;
  assigneeIds: string[];
  labelIds: string[];
  priorities: string[];
  dateFilter: string | null;
  createdAt: string;
}

export interface HighlightGroupResponse {
  id: string;
  boardId: string;
  name: string;
  cardIds: string[];
  createdAt: string;
}

/**
 * Tuỳ chọn RIÊNG của từng người trên một board: đánh dấu sao, bộ lọc đã lưu,
 * nhóm highlight.
 *
 * ⚠️ Khác mọi module trước ở một điểm quan trọng: dữ liệu ở đây lọc theo
 *    **user_id**, không phải theo board. Hai người cùng mở một board vẫn có bộ
 *    lọc riêng và danh sách sao riêng. Quên `.eq('user_id', uid)` là người này
 *    thấy — và xoá được — bộ lọc của người kia.
 *
 * Cũng vì là dữ liệu riêng nên KHÔNG phát sự kiện WebSocket: người khác không
 * cần biết mình vừa gắn sao cho board nào.
 */
@Injectable()
export class BoardPrefsService {
  private readonly logger = new Logger(BoardPrefsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly access: AccessService,
  ) {}

  private loi(what: string, message: string): InternalServerErrorException {
    this.logger.error(`${what}: ${message}`);
    return new InternalServerErrorException(what);
  }

  // ------------------------------------------------------------ đánh dấu sao

  /** Id các board mình đã gắn sao (trong mọi tổ chức). */
  async myStarredBoardIds(uid: string): Promise<string[]> {
    const { data, error } = await this.supabase.client
      .from('board_stars')
      .select('board_id')
      .eq('user_id', uid);
    if (error) throw this.loi('Không đọc được danh sách board đã gắn sao', error.message);
    return (data ?? []).map((r) => r.board_id as string);
  }

  async star(uid: string, boardId: string): Promise<{ boardId: string; starred: true }> {
    await this.access.assertBoardAccess(uid, boardId);

    // upsert + ignoreDuplicates: bấm sao hai lần (hoặc hai tab cùng bấm) không vỡ
    // vì trùng khoá chính — coi như đã sao rồi, không phải lỗi.
    const { error } = await this.supabase.client
      .from('board_stars')
      .upsert({ board_id: boardId, user_id: uid }, { onConflict: 'board_id,user_id', ignoreDuplicates: true });
    if (error) throw this.loi('Không gắn được sao', error.message);
    return { boardId, starred: true };
  }

  async unstar(uid: string, boardId: string): Promise<{ boardId: string; starred: false }> {
    await this.access.assertBoardAccess(uid, boardId);
    const { error } = await this.supabase.client
      .from('board_stars')
      .delete()
      .eq('board_id', boardId)
      .eq('user_id', uid);
    if (error) throw this.loi('Không bỏ được sao', error.message);
    return { boardId, starred: false };
  }

  // ------------------------------------------------------------- bộ lọc đã lưu

  async findFilters(uid: string, boardId: string): Promise<SavedFilterResponse[]> {
    if (!boardId) return [];
    await this.access.assertBoardAccess(uid, boardId);

    const { data, error } = await this.supabase.client
      .from('board_saved_filters')
      .select('*')
      .eq('board_id', boardId)
      .eq('user_id', uid) // ⚠️ bắt buộc — xem ghi chú đầu lớp
      .order('created_at', { ascending: true });
    if (error) throw this.loi('Không đọc được bộ lọc đã lưu', error.message);

    return (data ?? []).map((r) => ({
      id: r.id as string,
      boardId: r.board_id as string,
      name: r.name as string,
      assigneeIds: (r.assignee_ids as string[]) ?? [],
      labelIds: (r.label_ids as string[]) ?? [],
      priorities: (r.priorities as string[]) ?? [],
      dateFilter: (r.date_filter as string) ?? null,
      createdAt: r.created_at as string,
    }));
  }

  async createFilter(
    uid: string,
    input: {
      boardId: string;
      name: string;
      assigneeIds?: string[];
      labelIds?: string[];
      priorities?: string[];
      dateFilter?: string | null;
    },
  ): Promise<SavedFilterResponse> {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('Tên bộ lọc không được để trống.');
    await this.access.assertBoardAccess(uid, input.boardId);

    const { data, error } = await this.supabase.client
      .from('board_saved_filters')
      .insert({
        board_id: input.boardId,
        user_id: uid, // lấy từ TOKEN, không lấy từ body
        name,
        assignee_ids: input.assigneeIds ?? [],
        label_ids: input.labelIds ?? [],
        priorities: input.priorities ?? [],
        date_filter: input.dateFilter ?? null,
      })
      .select()
      .single();
    if (error) throw this.loi('Không lưu được bộ lọc', error.message);

    return {
      id: data.id as string,
      boardId: data.board_id as string,
      name: data.name as string,
      assigneeIds: (data.assignee_ids as string[]) ?? [],
      labelIds: (data.label_ids as string[]) ?? [],
      priorities: (data.priorities as string[]) ?? [],
      dateFilter: (data.date_filter as string) ?? null,
      createdAt: data.created_at as string,
    };
  }

  async removeFilter(uid: string, id: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('board_saved_filters')
      .delete()
      .eq('id', id)
      .eq('user_id', uid) // ⚠️ chốt: chỉ xoá được bộ lọc CỦA MÌNH
      .select();
    if (error && error.code !== '22P02') throw this.loi('Không xoá được bộ lọc', error.message);
    // Không khớp dòng nào → hoặc không tồn tại, hoặc của người khác. Cùng trả 404.
    if (!data || data.length === 0) throw new NotFoundException('Không tìm thấy bộ lọc.');
  }

  // -------------------------------------------------------- nhóm highlight

  async findGroups(uid: string, boardId: string): Promise<HighlightGroupResponse[]> {
    if (!boardId) return [];
    await this.access.assertBoardAccess(uid, boardId);

    const { data, error } = await this.supabase.client
      .from('board_highlight_groups')
      .select('*')
      .eq('board_id', boardId)
      .eq('user_id', uid)
      .order('created_at', { ascending: true });
    if (error) throw this.loi('Không đọc được nhóm highlight', error.message);

    return (data ?? []).map((r) => ({
      id: r.id as string,
      boardId: r.board_id as string,
      name: r.name as string,
      cardIds: (r.card_ids as string[]) ?? [],
      createdAt: r.created_at as string,
    }));
  }

  async createGroup(
    uid: string,
    input: { boardId: string; name: string; cardIds?: string[] },
  ): Promise<HighlightGroupResponse> {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('Tên nhóm không được để trống.');
    await this.access.assertBoardAccess(uid, input.boardId);

    const { data, error } = await this.supabase.client
      .from('board_highlight_groups')
      .insert({ board_id: input.boardId, user_id: uid, name, card_ids: input.cardIds ?? [] })
      .select()
      .single();
    if (error) throw this.loi('Không lưu được nhóm highlight', error.message);

    return {
      id: data.id as string,
      boardId: data.board_id as string,
      name: data.name as string,
      cardIds: (data.card_ids as string[]) ?? [],
      createdAt: data.created_at as string,
    };
  }

  async removeGroup(uid: string, id: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('board_highlight_groups')
      .delete()
      .eq('id', id)
      .eq('user_id', uid)
      .select();
    if (error && error.code !== '22P02') throw this.loi('Không xoá được nhóm highlight', error.message);
    if (!data || data.length === 0) throw new NotFoundException('Không tìm thấy nhóm highlight.');
  }
}
