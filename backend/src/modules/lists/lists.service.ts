import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { AccessService } from '../../common/access/access.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

/**
 * Postgres báo mã 22P02 khi nhận chuỗi không phải uuid vào cột kiểu uuid.
 *
 * Không bắt riêng mã này thì mọi id gõ sai (vd /boards/abc) đều rơi vào nhánh
 * `throw new InternalServerErrorException` → client nhận 500 khó hiểu, trong khi
 * đúng ra phải là 404 "không tìm thấy" — id sai định dạng thì chắc chắn không
 * trỏ tới dòng nào cả.
 */
const LOI_UUID_SAI = '22P02';

/** Dòng thô Supabase trả về (tên cột snake_case). */
interface ListRow {
  id: string;
  org_id: string;
  board_id: string;
  name: string;
  position: number;
  created_at: string;
}

/** Hình dạng API trả ra ngoài — camelCase, thống nhất với phần của Huy. */
export interface ListResponse {
  id: string;
  orgId: string;
  boardId: string;
  name: string;
  position: number;
  createdAt: string;
}

/** Đổi snake_case của Supabase sang camelCase trước khi trả ra. */
function toList(row: ListRow): ListResponse {
  return {
    id: row.id,
    orgId: row.org_id,
    boardId: row.board_id,
    name: row.name,
    position: row.position,
    createdAt: row.created_at,
  };
}

function laUuidSai(error: { code?: string } | null): boolean {
  return error?.code === LOI_UUID_SAI;
}

/** CRUD list + sắp xếp thứ tự (kéo thả ngang) (#4). */
@Injectable()
export class ListsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly realtime: RealtimeGateway,
    private readonly access: AccessService,
  ) {}

  /**
   * Danh sách list trong 1 board, sắp theo `position` tăng dần.
   * Thiếu `boardId` → trả `[]` thay vì lỗi.
   */
  async findAll(uid: string, boardId: string): Promise<ListResponse[]> {
    if (!boardId) return [];

    await this.access.assertBoardAccess(uid, boardId);

    const { data, error } = await this.supabase.client
      .from('lists')
      .select()
      .eq('board_id', boardId)
      .order('position', { ascending: true });
    if (error) {
      throw new InternalServerErrorException('Failed to load lists.');
    }
    return (data as ListRow[]).map(toList);
  }

  /**
   * Tạo list mới trong board — luôn thêm vào CUỐI.
   * `position` không có mặc định trong DB nên phải tự tính: lấy position lớn
   * nhất hiện có rồi +1. Board chưa có list nào thì bắt đầu từ 1 (tránh
   * `null + 1 = NaN` làm insert vỡ).
   */
  async create(
    uid: string,
    boardId: string,
    name: string,
  ): Promise<ListResponse> {
    if (!boardId || !name?.trim()) {
      throw new BadRequestException('Missing boardId or name.');
    }

    const { orgId } = await this.access.assertBoardAccess(uid, boardId);

    const { data: last, error: lastError } = await this.supabase.client
      .from('lists')
      .select('position')
      .eq('board_id', boardId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) {
      throw new InternalServerErrorException('Failed to load list position.');
    }
    const position = last ? last.position + 1 : 1;

    const { data, error } = await this.supabase.client
      .from('lists')
      .insert({ org_id: orgId, board_id: boardId, name: name.trim(), position })
      .select()
      .single();
    if (error) {
      throw new InternalServerErrorException('Failed to create list.');
    }
    const created = toList(data as ListRow);
    this.realtime.emitToBoard(boardId, 'list.created', uid, created);
    return created;
  }

  /**
   * Tìm list theo id + xác nhận `uid` thuộc tổ chức của nó.
   * Không tồn tại hoặc khác tổ chức → cùng trả 404 (không lộ list có thật hay không).
   */
  private async assertListAccess(
    uid: string,
    id: string,
  ): Promise<{ id: string; org_id: string; board_id: string }> {
    const { data: list, error } = await this.supabase.client
      .from('lists')
      .select('id, org_id, board_id')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      // id gõ sai định dạng uuid → coi như không tồn tại, đừng để lọt thành 500.
      if (laUuidSai(error)) throw new NotFoundException('List not found.');
      throw new InternalServerErrorException('Failed to load list.');
    }
    if (!list) {
      throw new NotFoundException('List not found.');
    }

    // Đi qua board để ăn ĐỦ ba tầng (tổ chức → workspace restricted → board
    // private). Kiểm mỗi `organization_members` như trước là bỏ lọt hai tầng
    // sau: người cùng tổ chức nhưng không có tên trong board vẫn sửa được cột.
    try {
      await this.access.assertBoardAccess(uid, list.board_id as string);
    } catch {
      throw new NotFoundException('List not found.');
    }

    return list;
  }

  /** Đổi tên list. Không tồn tại / khác tổ chức → 404. */
  async rename(uid: string, id: string, name: string): Promise<ListResponse> {
    if (!name?.trim()) {
      throw new BadRequestException('Missing name.');
    }

    await this.assertListAccess(uid, id);

    const { data, error } = await this.supabase.client
      .from('lists')
      .update({ name: name.trim() })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      throw new InternalServerErrorException('Failed to rename list.');
    }
    const renamed = toList(data as ListRow);
    this.realtime.emitToBoard(renamed.boardId, 'list.updated', uid, renamed);
    return renamed;
  }

  /**
   * Cập nhật vị trí list sau khi kéo thả.
   *
   * Cách A (đơn giản): client tự tính `position` mới (số thực, vd trung bình
   * của 2 list lân cận) rồi gửi thẳng lên — backend chỉ việc UPDATE 1 dòng,
   * không cần đọc/đánh số lại toàn bộ danh sách.
   */
  async reorder(
    uid: string,
    id: string,
    position: number,
  ): Promise<ListResponse> {
    if (typeof position !== 'number' || Number.isNaN(position)) {
      throw new BadRequestException('position must be a number.');
    }

    await this.assertListAccess(uid, id);

    const { data, error } = await this.supabase.client
      .from('lists')
      .update({ position })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      throw new InternalServerErrorException('Failed to update position.');
    }
    const moved = toList(data as ListRow);
    this.realtime.emitToBoard(moved.boardId, 'list.updated', uid, moved);
    return moved;
  }

  /** Xoá list. `ON DELETE CASCADE` tự xoá card bên trong. */
  async remove(uid: string, id: string): Promise<void> {
    const list = await this.assertListAccess(uid, id);

    const { error } = await this.supabase.client
      .from('lists')
      .delete()
      .eq('id', id);
    if (error) {
      throw new InternalServerErrorException('Failed to delete list.');
    }
    // Thẻ bên trong bị CASCADE xoá theo — client tự dọn khi nhận 'list.deleted',
    // không cần phát thêm 'card.deleted' cho từng thẻ.
    this.realtime.emitToBoard(list.board_id, 'list.deleted', uid, { id });
  }
}
