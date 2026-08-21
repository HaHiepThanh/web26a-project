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

/** CRUD list + sắp xếp thứ tự (kéo thả ngang) (#4). */
@Injectable()
export class ListsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Kiểm tra user có được truy cập board này không, trả về `org_id` của nó.
   * `lists.org_id` là NOT NULL nhưng client chỉ gửi `boardId` lên, nên phải đi
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

  /**
   * Danh sách list trong 1 board, sắp theo `position` tăng dần.
   * Thiếu `boardId` → trả `[]` thay vì lỗi.
   */
  async findAll(uid: string, boardId: string): Promise<unknown[]> {
    if (!boardId) return [];

    await this.assertBoardAccess(uid, boardId);

    const { data, error } = await this.supabase.client
      .from('lists')
      .select()
      .eq('board_id', boardId)
      .order('position', { ascending: true });
    if (error) {
      throw new InternalServerErrorException('Không đọc được danh sách list.');
    }
    return data;
  }

  /**
   * Tạo list mới trong board — luôn thêm vào CUỐI.
   * `position` không có mặc định trong DB nên phải tự tính: lấy position lớn
   * nhất hiện có rồi +1. Board chưa có list nào thì bắt đầu từ 1 (tránh
   * `null + 1 = NaN` làm insert vỡ).
   */
  async create(uid: string, boardId: string, name: string): Promise<unknown> {
    if (!boardId || !name?.trim()) {
      throw new BadRequestException('Thiếu boardId hoặc name.');
    }

    const orgId = await this.assertBoardAccess(uid, boardId);

    const { data: last, error: lastError } = await this.supabase.client
      .from('lists')
      .select('position')
      .eq('board_id', boardId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) {
      throw new InternalServerErrorException('Không đọc được vị trí cột.');
    }
    const position = last ? last.position + 1 : 1;

    const { data, error } = await this.supabase.client
      .from('lists')
      .insert({ org_id: orgId, board_id: boardId, name: name.trim(), position })
      .select()
      .single();
    if (error) {
      throw new InternalServerErrorException('Không tạo được list.');
    }
    return data;
  }

  /**
   * Tìm list theo id + xác nhận `uid` thuộc tổ chức của nó.
   * Không tồn tại hoặc khác tổ chức → cùng trả 404 (không lộ list có thật hay không).
   */
  private async assertListAccess(uid: string, id: string): Promise<{ id: string; org_id: string }> {
    const { data: list, error } = await this.supabase.client
      .from('lists')
      .select('id, org_id')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      // id gõ sai định dạng uuid → coi như không tồn tại, đừng để lọt thành 500.
      if (laUuidSai(error)) throw new NotFoundException('Không tìm thấy cột.');
      throw new InternalServerErrorException('Không đọc được list.');
    }
    if (!list) {
      throw new NotFoundException('Không tìm thấy list.');
    }

    const { data: member, error: memberError } = await this.supabase.client
      .from('organization_members')
      .select('role')
      .eq('org_id', list.org_id)
      .eq('user_id', uid)
      .maybeSingle();
    if (memberError) {
      throw new InternalServerErrorException('Không kiểm tra được quyền.');
    }
    if (!member) {
      throw new NotFoundException('Không tìm thấy list.');
    }

    return list;
  }

  /** Đổi tên list. Không tồn tại / khác tổ chức → 404. */
  async rename(uid: string, id: string, name: string): Promise<unknown> {
    if (!name?.trim()) {
      throw new BadRequestException('Thiếu name.');
    }

    await this.assertListAccess(uid, id);

    const { data, error } = await this.supabase.client
      .from('lists')
      .update({ name: name.trim() })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      throw new InternalServerErrorException('Không đổi được tên list.');
    }
    return data;
  }

  /**
   * Cập nhật vị trí list sau khi kéo thả.
   *
   * Cách A (đơn giản): client tự tính `position` mới (số thực, vd trung bình
   * của 2 list lân cận) rồi gửi thẳng lên — backend chỉ việc UPDATE 1 dòng,
   * không cần đọc/đánh số lại toàn bộ danh sách.
   */
  async reorder(uid: string, id: string, position: number): Promise<unknown> {
    if (typeof position !== 'number' || Number.isNaN(position)) {
      throw new BadRequestException('position phải là số.');
    }

    await this.assertListAccess(uid, id);

    const { data, error } = await this.supabase.client
      .from('lists')
      .update({ position })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      throw new InternalServerErrorException('Không cập nhật được vị trí.');
    }
    return data;
  }

  /** Xoá list. `ON DELETE CASCADE` tự xoá card bên trong. */
  async remove(uid: string, id: string): Promise<void> {
    await this.assertListAccess(uid, id);

    const { error } = await this.supabase.client.from('lists').delete().eq('id', id);
    if (error) {
      throw new InternalServerErrorException('Không xoá được list.');
    }
  }
}
