import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

/**
 * Postgres báo mã 22P02 khi nhận chuỗi không phải uuid vào cột kiểu uuid.
 *
 * Không bắt riêng mã này thì mọi id gõ sai (vd /boards/abc) đều rơi vào nhánh
 * `throw new InternalServerErrorException` → client nhận 500 khó hiểu, trong khi
 * đúng ra phải là 404 "không tìm thấy" — id sai định dạng thì chắc chắn không
 * trỏ tới dòng nào cả.
 */
const LOI_UUID_SAI = '22P02';

function laUuidSai(error: { code?: string } | null): boolean {
  return error?.code === LOI_UUID_SAI;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Nhãn màu theo board + gắn/gỡ nhãn cho card (#4). */
@Injectable()
export class LabelsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Kiểm tra user có được truy cập board này không, trả về `org_id` của nó.
   * `labels.org_id` là NOT NULL nhưng client chỉ gửi `boardId`, nên phải đi
   * qua board để lấy — đồng thời tiện kiểm tra quyền luôn.
   */
  private async assertBoardAccess(uid: string, boardId: string): Promise<string> {
    const { data: board, error: boardError } = await this.supabase.client
      .from('boards')
      .select('id, org_id')
      .eq('id', boardId)
      .maybeSingle();
    if (boardError) {
      // id gõ sai định dạng uuid → coi như không tồn tại, đừng để lọt thành 500.
      if (laUuidSai(boardError)) throw new NotFoundException('Không tìm thấy board.');
      throw new InternalServerErrorException('Không đọc được board.');
    }
    if (!board) {
      throw new NotFoundException('Không tìm thấy board.');
    }

    const { data: member, error: memberError } = await this.supabase.client
      .from('organization_members')
      .select('role')
      .eq('org_id', board.org_id)
      .eq('user_id', uid)
      .maybeSingle();
    if (memberError) {
      throw new InternalServerErrorException('Không kiểm tra được quyền.');
    }
    if (!member) {
      throw new ForbiddenException('Bạn không thuộc tổ chức của board này.');
    }

    return board.org_id;
  }

  /** Danh sách nhãn của 1 board. Thiếu `boardId` → trả `[]` thay vì lỗi. */
  async findAll(uid: string, boardId: string): Promise<unknown[]> {
    if (!boardId) return [];

    await this.assertBoardAccess(uid, boardId);

    const { data, error } = await this.supabase.client
      .from('labels')
      .select()
      .eq('board_id', boardId);
    if (error) {
      throw new InternalServerErrorException('Không đọc được danh sách nhãn.');
    }
    return data;
  }

  /** Tạo nhãn mới cho board. `color` phải đúng định dạng hex `#rrggbb`. */
  async create(uid: string, boardId: string, name: string, color: string): Promise<unknown> {
    if (!boardId || !name?.trim()) {
      throw new BadRequestException('Thiếu boardId hoặc name.');
    }
    if (!color || !HEX_COLOR.test(color)) {
      throw new BadRequestException('color phải là mã hex dạng #rrggbb.');
    }

    const orgId = await this.assertBoardAccess(uid, boardId);

    const { data, error } = await this.supabase.client
      .from('labels')
      .insert({ org_id: orgId, board_id: boardId, name: name.trim(), color })
      .select()
      .single();
    if (error) {
      throw new InternalServerErrorException('Không tạo được nhãn.');
    }
    return data;
  }

  /**
   * Gắn nhãn vào card. Card và label PHẢI cùng board — không thì gắn được
   * nhãn của board A vào thẻ board B, dữ liệu hỏng mà không ai phát hiện.
   *
   * `cards` không có `board_id` trực tiếp, phải đi vòng qua `lists`.
   * Gắn 2 lần cùng 1 cặp card+label không báo lỗi (upsert, ignoreDuplicates).
   */
  async attach(uid: string, cardId: string, labelId: string): Promise<unknown> {
    const { data: label, error: labelError } = await this.supabase.client
      .from('labels')
      .select('id, board_id, org_id')
      .eq('id', labelId)
      .maybeSingle();
    if (labelError) {
      // id gõ sai định dạng uuid → coi như không tồn tại, đừng để lọt thành 500.
      if (laUuidSai(labelError)) throw new NotFoundException('Không tìm thấy nhãn.');
      throw new InternalServerErrorException('Không đọc được nhãn.');
    }
    if (!label) {
      throw new NotFoundException('Không tìm thấy nhãn.');
    }

    const { data: member, error: memberError } = await this.supabase.client
      .from('organization_members')
      .select('role')
      .eq('org_id', label.org_id)
      .eq('user_id', uid)
      .maybeSingle();
    if (memberError) {
      throw new InternalServerErrorException('Không kiểm tra được quyền.');
    }
    if (!member) {
      throw new NotFoundException('Không tìm thấy nhãn.');
    }

    const { data: card, error: cardError } = await this.supabase.client
      .from('cards')
      .select('id, list_id')
      .eq('id', cardId)
      .maybeSingle();
    if (cardError) {
      // id gõ sai định dạng uuid → coi như không tồn tại, đừng để lọt thành 500.
      if (laUuidSai(cardError)) throw new NotFoundException('Không tìm thấy card.');
      throw new InternalServerErrorException('Không đọc được card.');
    }
    if (!card) {
      throw new NotFoundException('Không tìm thấy card.');
    }

    const { data: list, error: listError } = await this.supabase.client
      .from('lists')
      .select('board_id')
      .eq('id', card.list_id)
      .maybeSingle();
    if (listError || !list) {
      throw new InternalServerErrorException('Không đọc được list của card.');
    }

    if (list.board_id !== label.board_id) {
      throw new BadRequestException('Card và nhãn không cùng board.');
    }

    const { data, error } = await this.supabase.client
      .from('card_labels')
      .upsert({ card_id: cardId, label_id: labelId }, { onConflict: 'card_id,label_id', ignoreDuplicates: true })
      .select()
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException('Không gắn được nhãn.');
    }
    return data ?? { card_id: cardId, label_id: labelId };
  }

  /**
   * Gỡ nhãn khỏi card.
   * `.delete()` của Supabase không tự báo lỗi khi không khớp dòng nào, nên phải
   * tự kiểm tra `data` rỗng để trả 404 cho trường hợp "chưa từng gắn".
   */
  async detach(uid: string, cardId: string, labelId: string): Promise<void> {
    const { data: label, error: labelError } = await this.supabase.client
      .from('labels')
      .select('id, org_id')
      .eq('id', labelId)
      .maybeSingle();
    if (labelError) {
      // id gõ sai định dạng uuid → coi như không tồn tại, đừng để lọt thành 500.
      if (laUuidSai(labelError)) throw new NotFoundException('Không tìm thấy nhãn.');
      throw new InternalServerErrorException('Không đọc được nhãn.');
    }
    if (!label) {
      throw new NotFoundException('Không tìm thấy nhãn.');
    }

    const { data: member, error: memberError } = await this.supabase.client
      .from('organization_members')
      .select('role')
      .eq('org_id', label.org_id)
      .eq('user_id', uid)
      .maybeSingle();
    if (memberError) {
      throw new InternalServerErrorException('Không kiểm tra được quyền.');
    }
    if (!member) {
      throw new NotFoundException('Không tìm thấy nhãn.');
    }

    const { data, error } = await this.supabase.client
      .from('card_labels')
      .delete()
      .eq('card_id', cardId)
      .eq('label_id', labelId)
      .select();
    if (error) {
      throw new InternalServerErrorException('Không gỡ được nhãn.');
    }
    if (!data || data.length === 0) {
      throw new NotFoundException('Nhãn này chưa được gắn vào thẻ.');
    }
  }
}
