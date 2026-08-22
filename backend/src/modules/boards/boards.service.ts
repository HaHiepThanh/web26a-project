import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
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
interface BoardRow {
  id: string;
  org_id: string;
  workspace_id: string;
  name: string;
  visibility: string;
  background: string | null;
  background_image_path: string | null;
  created_by: string;
  created_at: string;
}

/** Hình dạng API trả ra ngoài — camelCase, thống nhất với phần của Huy. */
export interface BoardResponse {
  id: string;
  orgId: string;
  workspaceId: string;
  name: string;
  visibility: string;
  background: string | null;
  backgroundImagePath: string | null;
  createdBy: string;
  createdAt: string;
}

/**
 * Đổi snake_case của Supabase sang camelCase trước khi trả ra.
 *
 * ⚠️ ĐỪNG trả thẳng `data` của Supabase. Nó giữ nguyên tên cột trong database
 *    (`org_id`, `created_at`), trong khi phần còn lại của API dùng camelCase —
 *    frontend sẽ phải nhớ endpoint nào dùng kiểu nào.
 */
function toBoard(row: BoardRow): BoardResponse {
  return {
    id: row.id,
    orgId: row.org_id,
    workspaceId: row.workspace_id,
    name: row.name,
    visibility: row.visibility,
    background: row.background,
    backgroundImagePath: row.background_image_path,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function laUuidSai(error: { code?: string } | null): boolean {
  return error?.code === LOI_UUID_SAI;
}

/** CRUD board + visibility (#3). Xoá board chỉ owner (#7). */
@Injectable()
export class BoardsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly realtime: RealtimeGateway,
  ) {}

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
      // id gõ sai định dạng uuid → coi như không tồn tại, đừng để lọt thành 500.
      if (laUuidSai(wsError)) throw new NotFoundException('Không tìm thấy workspace.');
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
  async findAll(uid: string, workspaceId: string): Promise<BoardResponse[]> {
    if (!workspaceId) return [];

    await this.assertWorkspaceAccess(uid, workspaceId);

    const { data, error } = await this.supabase.client
      .from('boards')
      .select()
      .eq('workspace_id', workspaceId);
    if (error) {
      throw new InternalServerErrorException('Không đọc được danh sách board.');
    }
    return (data as BoardRow[]).map(toBoard);
  }

  /**
   * Lấy 1 board theo id.
   *
   * Không tồn tại HOẶC không thuộc tổ chức của user → đều trả 404 như nhau —
   * không để lộ "board này có thật nhưng bạn không có quyền", tránh dò id.
   */
  async findOne(uid: string, id: string): Promise<BoardResponse> {
    const { data: board, error } = await this.supabase.client
      .from('boards')
      .select()
      .eq('id', id)
      .maybeSingle();
    if (error) {
      // id gõ sai định dạng uuid → coi như không tồn tại, đừng để lọt thành 500.
      if (laUuidSai(error)) throw new NotFoundException('Không tìm thấy board.');
      throw new InternalServerErrorException('Không đọc được board.');
    }
    if (!board) {
      throw new NotFoundException('Không tìm thấy board.');
    }

    const { data: member, error: memberError } = await this.supabase.client
      .from('organization_members')
      .select('role')
      // `board` ở đây là DÒNG THÔ từ Supabase (snake_case) — chưa qua toBoard().
      .eq('org_id', (board as BoardRow).org_id)
      .eq('user_id', uid)
      .maybeSingle();
    if (memberError) {
      throw new InternalServerErrorException('Không kiểm tra được quyền.');
    }
    if (!member) {
      throw new NotFoundException('Không tìm thấy board.');
    }

    return toBoard(board as BoardRow);
  }

  /**
   * Tạo board trong 1 workspace.
   *
   * `boards.org_id` là NOT NULL nhưng body không gửi org_id lên — phải đi tìm
   * workspace trước để lấy org_id của nó, đồng thời nhân tiện kiểm tra user có
   * thuộc tổ chức đó không (chưa có org_id nào tin được từ phía client).
   */
  async create(uid: string, workspaceId: string, name: string): Promise<BoardResponse> {
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
    return toBoard(data as BoardRow);
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
    const updated = toBoard(data as BoardRow);
    this.realtime.emitToBoard(id, 'board.updated', uid, updated);
    return updated;
  }

  /**
   * Xoá board. `ON DELETE CASCADE` trong database.sql tự xoá list/card/label
   * bên trong, không cần tự tay xoá từng bảng.
   */
  async remove(uid: string, id: string): Promise<void> {
    // Ném 404 nếu board không tồn tại hoặc user không thuộc tổ chức của nó.
    const board = await this.findOne(uid, id);

    // Xoá board là hành động không hoàn tác được (kéo theo list/card/nhãn bên
    // trong qua ON DELETE CASCADE) → chỉ owner/admin. Kiểm tra ở đây chứ không
    // dùng @Roles trên controller: xem ghi chú ở boards.controller.ts.
    const { data: member, error: memberError } = await this.supabase.client
      .from('organization_members')
      .select('role')
      .eq('org_id', board.orgId)
      .eq('user_id', uid)
      .maybeSingle();
    if (memberError) {
      throw new InternalServerErrorException('Không kiểm tra được quyền.');
    }
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      throw new ForbiddenException('Chỉ owner hoặc admin mới xoá được board.');
    }

    const { error } = await this.supabase.client.from('boards').delete().eq('id', id);
    if (error) {
      throw new InternalServerErrorException('Không xoá được board.');
    }
    // Ai đang mở board này cần biết ngay để rời trang, thay vì ngồi thao tác tiếp
    // trên một board không còn tồn tại rồi nhận 404 ở mọi thao tác.
    this.realtime.emitToBoard(id, 'board.deleted', uid, { id });
  }
}
