import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

/** CRUD board + visibility (#3). Xoá board chỉ owner (#7). */
@Injectable()
export class BoardsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Kiểm tra user có được truy cập workspace này không, trả về `org_id` của nó.
   *
   * Dùng chung cho mọi endpoint boards/lists/labels vì tất cả đều cần đi qua
   * workspace để lấy org_id — tách ra một chỗ để khỏi chép lại logic tìm +
   * kiểm tra quyền ở từng hàm.
   */
  private async assertWorkspaceAccess(uid: string, workspaceId: string): Promise<string> {
    const { data: ws, error: wsError } = await this.supabase.client
      .from('workspaces')
      .select('id, org_id')
      .eq('id', workspaceId)
      .maybeSingle();
    if (wsError) {
      throw new InternalServerErrorException('Không đọc được workspace.');
    }
    if (!ws) {
      throw new NotFoundException('Không tìm thấy workspace.');
    }

    const { data: member, error: memberError } = await this.supabase.client
      .from('organization_members')
      .select('role')
      .eq('org_id', ws.org_id)
      .eq('user_id', uid)
      .maybeSingle();
    if (memberError) {
      throw new InternalServerErrorException('Không kiểm tra được quyền.');
    }
    if (!member) {
      throw new ForbiddenException('Bạn không thuộc tổ chức của workspace này.');
    }

    return ws.org_id;
  }

  /**
   * Danh sách board trong 1 workspace.
   * Thiếu `workspaceId` → trả `[]` thay vì lỗi (đúng theo HOA.md).
   */
  async findAll(uid: string, workspaceId: string): Promise<unknown[]> {
    if (!workspaceId) return [];

    await this.assertWorkspaceAccess(uid, workspaceId);

    const { data, error } = await this.supabase.client
      .from('boards')
      .select()
      .eq('workspace_id', workspaceId);
    if (error) {
      throw new InternalServerErrorException('Không đọc được danh sách board.');
    }
    return data;
  }

  /**
   * Lấy 1 board theo id.
   *
   * Không tồn tại HOẶC không thuộc tổ chức của user → đều trả 404 như nhau —
   * không để lộ "board này có thật nhưng bạn không có quyền", tránh dò id.
   */
  async findOne(uid: string, id: string): Promise<unknown> {
    const { data: board, error } = await this.supabase.client
      .from('boards')
      .select()
      .eq('id', id)
      .maybeSingle();
    if (error) {
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
      throw new NotFoundException('Không tìm thấy board.');
    }

    return board;
  }

  /**
   * Tạo board trong 1 workspace.
   *
   * `boards.org_id` là NOT NULL nhưng body không gửi org_id lên — phải đi tìm
   * workspace trước để lấy org_id của nó, đồng thời nhân tiện kiểm tra user có
   * thuộc tổ chức đó không (chưa có org_id nào tin được từ phía client).
   */
  async create(uid: string, workspaceId: string, name: string): Promise<unknown> {
    if (!workspaceId || !name?.trim()) {
      throw new BadRequestException('Thiếu workspaceId hoặc name.');
    }

    const orgId = await this.assertWorkspaceAccess(uid, workspaceId);

    const { data, error } = await this.supabase.client
      .from('boards')
      .insert({
        org_id: orgId,
        workspace_id: workspaceId,
        name: name.trim(),
        created_by: uid,
      })
      .select()
      .single();
    if (error) {
      throw new InternalServerErrorException('Không tạo được board.');
    }
    return data;
  }

  /**
   * Sửa tên/visibility của board.
   *
   * Chỉ ghi field ĐƯỢC GỬI LÊN vào `patch`. Nếu viết thẳng
   * `.update({ name: changes.name, visibility: changes.visibility })`, gửi mỗi
   * `{name}` sẽ khiến `visibility` bị ghi thành `undefined` → Postgres nhận null
   * → xoá mất giá trị đang có, dù client không hề muốn đổi field đó.
   */
  async update(
    uid: string,
    id: string,
    changes: { name?: string; visibility?: string },
  ): Promise<unknown> {
    await this.findOne(uid, id); // ném 404 nếu không tồn tại / khác tổ chức

    const validVisibilities = ['workspace', 'private', 'public'];
    if (changes.visibility !== undefined && !validVisibilities.includes(changes.visibility)) {
      throw new BadRequestException('visibility phải là workspace, private hoặc public.');
    }

    const patch: Record<string, string> = {};
    if (changes.name !== undefined) patch.name = changes.name.trim();
    if (changes.visibility !== undefined) patch.visibility = changes.visibility;

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('Không có gì để cập nhật.');
    }

    const { data, error } = await this.supabase.client
      .from('boards')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      throw new InternalServerErrorException('Không cập nhật được board.');
    }
    return data;
  }

  /**
   * Xoá board. `ON DELETE CASCADE` trong database.sql tự xoá list/card/label
   * bên trong, không cần tự tay xoá từng bảng.
   */
  async remove(uid: string, id: string): Promise<void> {
    await this.findOne(uid, id); // ném 404 nếu không tồn tại / khác tổ chức

    const { error } = await this.supabase.client.from('boards').delete().eq('id', id);
    if (error) {
      throw new InternalServerErrorException('Không xoá được board.');
    }
  }
}
