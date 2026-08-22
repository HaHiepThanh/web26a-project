import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { AccessService } from '../../common/access/access.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

interface ChecklistRow {
  id: string;
  card_id: string;
  content: string;
  is_done: boolean;
  position: number;
}

export interface ChecklistItemResponse {
  id: string;
  cardId: string;
  content: string;
  isDone: boolean;
  position: number;
}

function toItem(row: ChecklistRow): ChecklistItemResponse {
  return {
    id: row.id,
    cardId: row.card_id,
    content: row.content,
    isDone: row.is_done,
    position: row.position,
  };
}

/**
 * Checklist bên trong thẻ (bảng `checklist_items`).
 *
 * `position` là số THỰC (double precision) — chèn giữa hai mục chỉ cần lấy trung
 * bình vị trí hai hàng xóm, không phải đánh số lại cả danh sách.
 */
@Injectable()
export class ChecklistService {
  private readonly logger = new Logger(ChecklistService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly access: AccessService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async findAll(uid: string, cardId: string): Promise<ChecklistItemResponse[]> {
    if (!cardId) return [];
    await this.access.assertCardAccess(uid, cardId);

    const { data, error } = await this.supabase.client
      .from('checklist_items')
      .select('*')
      .eq('card_id', cardId)
      .order('position', { ascending: true });

    if (error) {
      this.logger.error(`Đọc checklist thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không đọc được checklist');
    }
    return (data as ChecklistRow[]).map(toItem);
  }

  async create(uid: string, cardId: string, content: string): Promise<ChecklistItemResponse> {
    const text = content?.trim();
    if (!text) throw new BadRequestException('Nội dung không được để trống.');

    const card = await this.access.assertCardAccess(uid, cardId);

    // Mục mới luôn về CUỐI. `position` không có mặc định nên phải tự tính; danh
    // sách rỗng thì bắt đầu từ 1 (tránh `null + 1 = NaN` làm insert vỡ).
    const { data: last } = await this.supabase.client
      .from('checklist_items')
      .select('position')
      .eq('card_id', cardId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await this.supabase.client
      .from('checklist_items')
      .insert({ card_id: cardId, content: text, position: last ? last.position + 1 : 1 })
      .select()
      .single();

    if (error) {
      this.logger.error(`Tạo mục checklist thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không tạo được mục checklist');
    }

    const created = toItem(data as ChecklistRow);
    this.realtime.emitToBoard(card.boardId, 'checklist.changed', uid, { cardId, item: created });
    return created;
  }

  /** Tìm mục + kiểm tra quyền qua thẻ chứa nó. */
  private async assertItem(uid: string, id: string): Promise<{ row: ChecklistRow; boardId: string }> {
    const { data, error } = await this.supabase.client
      .from('checklist_items')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error?.code === '22P02' || !data) throw new NotFoundException('Không tìm thấy mục checklist.');

    const card = await this.access.assertCardAccess(uid, (data as ChecklistRow).card_id);
    return { row: data as ChecklistRow, boardId: card.boardId };
  }

  async update(
    uid: string,
    id: string,
    changes: { content?: string; isDone?: boolean; position?: number },
  ): Promise<ChecklistItemResponse> {
    const { row, boardId } = await this.assertItem(uid, id);

    const patch: Record<string, unknown> = {};
    if (changes.content !== undefined) {
      const text = changes.content.trim();
      if (!text) throw new BadRequestException('Nội dung không được để trống.');
      patch.content = text;
    }
    if (changes.isDone !== undefined) patch.is_done = changes.isDone;
    if (changes.position !== undefined) patch.position = changes.position;

    if (Object.keys(patch).length === 0) return toItem(row);

    const { data, error } = await this.supabase.client
      .from('checklist_items')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Cập nhật checklist thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không cập nhật được mục checklist');
    }

    const updated = toItem(data as ChecklistRow);
    this.realtime.emitToBoard(boardId, 'checklist.changed', uid, { cardId: updated.cardId, item: updated });
    return updated;
  }

  async remove(uid: string, id: string): Promise<void> {
    const { row, boardId } = await this.assertItem(uid, id);

    const { error } = await this.supabase.client.from('checklist_items').delete().eq('id', id);
    if (error) {
      this.logger.error(`Xoá mục checklist thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không xoá được mục checklist');
    }
    this.realtime.emitToBoard(boardId, 'checklist.deleted', uid, { cardId: row.card_id, id });
  }
}
