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

/** Ba mức hiển thị của board (khớp CHECK constraint trong database.sql). */
const VISIBILITIES = ['workspace', 'private', 'public'];

interface JoinedUser {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
}

/** Khối `users(...)` Supabase join kèm → camelCase. */
function toUser(row: unknown) {
  const u = row as JoinedUser | null;
  if (!u) return null;
  return { id: u.id, email: u.email, displayName: u.display_name, avatarUrl: u.avatar_url };
}

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
  /**
   * Người được chỉ định xem board. CHỈ có ý nghĩa khi `visibility === 'private'`;
   * với 'workspace'/'public' thì rỗng vì lúc đó cả workspace đều thấy.
   */
  memberIds: string[];
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
function toBoard(row: BoardRow, memberIds: string[] = []): BoardResponse {
  return {
    memberIds: row.visibility === 'private' ? memberIds : [],
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
      .select('id, org_id, visibility')
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

    // Workspace `restricted` chỉ mở cho người được chỉ định — kể cả khi họ vẫn
    // thuộc tổ chức. Thiếu chốt này thì đặt phạm vi cho workspace là vô nghĩa:
    // ai cũng lách vào qua đường /boards?workspaceId=.
    if ((ws.visibility as string) === 'restricted' && !(await this.laThanhVienWorkspace(uid, workspaceId))) {
      throw new NotFoundException('Không tìm thấy workspace.');
    }

    return ws.org_id;
  }

  /**
   * Chỉ owner/admin của tổ chức mới TẠO / SỬA / XOÁ được board.
   *
   * `member` chỉ được LÀM VIỆC bên trong board: thêm cột, kéo thẻ, bình luận,
   * chat, gắn nhãn — những thứ đó không đi qua hàm này.
   *
   * ⚠️ Phải chặn ở BACKEND. Ẩn nút trên giao diện chỉ cho gọn mắt; người dùng
   *    vẫn gọi thẳng API bằng token của họ được.
   */
  private async assertCanManage(uid: string, orgId: string): Promise<void> {
    const { data } = await this.supabase.client
      .from('organization_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', uid)
      .maybeSingle();
    const role = data?.role as string | undefined;
    if (role !== 'owner' && role !== 'admin') {
      throw new ForbiddenException('Chỉ chủ tổ chức hoặc quản trị viên mới quản lý được board.');
    }
  }

  private async laThanhVienWorkspace(uid: string, workspaceId: string): Promise<boolean> {
    const { data } = await this.supabase.client
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', uid)
      .maybeSingle();
    return !!data;
  }

  /** user_id của những người được chỉ định xem 1 board. */
  private async memberIdsOf(boardId: string): Promise<string[]> {
    const { data } = await this.supabase.client
      .from('board_members')
      .select('user_id')
      .eq('board_id', boardId);
    return (data ?? []).map((r) => r.user_id as string);
  }

  /**
   * Lọc danh sách người được chỉ định xem board.
   *
   * ⚠️ Vùng chọn là THÀNH VIÊN WORKSPACE, không phải thành viên tổ chức. Tổ chức
   *    10 người mà workspace chỉ mở cho 5 thì board bên trong nhiều nhất cũng chỉ
   *    được 5 — cho phép chọn cả 10 là mở lại đúng cánh cửa vừa khoá ở trên.
   */
  private async locTheoWorkspace(
    workspaceId: string,
    creatorUid: string,
    memberIds: string[],
  ): Promise<string[]> {
    const wanted = [...new Set([creatorUid, ...(memberIds ?? [])])];

    const { data: ws } = await this.supabase.client
      .from('workspaces')
      .select('org_id, visibility')
      .eq('id', workspaceId)
      .maybeSingle();
    if (!ws) throw new NotFoundException('Không tìm thấy workspace.');

    // Workspace mở cho cả tổ chức → vùng chọn là thành viên tổ chức.
    // Workspace `restricted` → vùng chọn hẹp lại đúng bằng workspace_members.
    const bang = (ws.visibility as string) === 'restricted' ? 'workspace_members' : 'organization_members';
    const cot = bang === 'workspace_members' ? 'workspace_id' : 'org_id';
    const giaTri = bang === 'workspace_members' ? workspaceId : (ws.org_id as string);

    const { data } = await this.supabase.client
      .from(bang)
      .select('user_id')
      .eq(cot, giaTri)
      .in('user_id', wanted);

    const hopLe = new Set((data ?? []).map((r) => r.user_id as string));
    const bo = wanted.filter((id) => !hopLe.has(id));
    if (bo.length) {
      throw new BadRequestException(
        `Có ${bo.length} người không nằm trong workspace này nên không thêm vào board được.`,
      );
    }
    return wanted;
  }

  /** Ghi lại đúng tập thành viên board (xoá hết rồi thêm lại cho chắc khớp). */
  private async ghiThanhVien(boardId: string, ids: string[]): Promise<void> {
    const sb = this.supabase.client;
    await sb.from('board_members').delete().eq('board_id', boardId);
    if (!ids.length) return;
    const { error } = await sb
      .from('board_members')
      .insert(ids.map((id) => ({ board_id: boardId, user_id: id })));
    if (error) {
      throw new InternalServerErrorException('Không lưu được danh sách thành viên board');
    }
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

    const rows = data as BoardRow[];
    if (!rows.length) return [];

    // Một truy vấn cho MỌI board thay vì mỗi board một truy vấn.
    const { data: memberRows } = await this.supabase.client
      .from('board_members')
      .select('board_id, user_id')
      .in(
        'board_id',
        rows.map((b) => b.id),
      );

    const theoBoard = new Map<string, string[]>();
    for (const m of memberRows ?? []) {
      const key = m.board_id as string;
      theoBoard.set(key, [...(theoBoard.get(key) ?? []), m.user_id as string]);
    }

    // Board 'private' chỉ hiện với người được chỉ định. Lọc ở ĐÂY chứ không ở
    // frontend — gửi xuống rồi mới ẩn thì mở tab Network là đọc được hết.
    return rows
      .filter((b) => b.visibility !== 'private' || (theoBoard.get(b.id) ?? []).includes(uid))
      .map((b) => toBoard(b, theoBoard.get(b.id) ?? []));
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

    const row = board as BoardRow;

    // Board nằm trong workspace `restricted` mà mình không thuộc → coi như không có.
    const { data: ws } = await this.supabase.client
      .from('workspaces')
      .select('visibility')
      .eq('id', row.workspace_id)
      .maybeSingle();
    if (
      (ws?.visibility as string) === 'restricted' &&
      !(await this.laThanhVienWorkspace(uid, row.workspace_id))
    ) {
      throw new NotFoundException('Không tìm thấy board.');
    }

    const ids = await this.memberIdsOf(row.id);
    if (row.visibility === 'private' && !ids.includes(uid)) {
      throw new NotFoundException('Không tìm thấy board.');
    }

    return toBoard(row, ids);
  }

  /**
   * Tạo board trong 1 workspace.
   *
   * `boards.org_id` là NOT NULL nhưng body không gửi org_id lên — phải đi tìm
   * workspace trước để lấy org_id của nó, đồng thời nhân tiện kiểm tra user có
   * thuộc tổ chức đó không (chưa có org_id nào tin được từ phía client).
   */
  async create(
    uid: string,
    workspaceId: string,
    name: string,
    visibility: string = 'workspace',
    memberIds: string[] = [],
  ): Promise<BoardResponse> {
    if (!workspaceId || !name?.trim()) {
      throw new BadRequestException('Thiếu workspaceId hoặc name.');
    }
    if (!VISIBILITIES.includes(visibility)) {
      throw new BadRequestException('visibility phải là workspace, private hoặc public.');
    }

    const orgId = await this.assertWorkspaceAccess(uid, workspaceId);
    await this.assertCanManage(uid, orgId);

    // Lọc danh sách TRƯỚC khi tạo board: sai thì hỏng ngay, không để lại board
    // nửa vời phải đi dọn.
    const ids = visibility === 'private' ? await this.locTheoWorkspace(workspaceId, uid, memberIds) : [];

    const { data, error } = await this.supabase.client
      .from('boards')
      .insert({
        org_id: orgId,
        workspace_id: workspaceId,
        name: name.trim(),
        visibility,
        created_by: uid,
      })
      .select()
      .single();
    if (error) {
      throw new InternalServerErrorException('Không tạo được board.');
    }

    const row = data as BoardRow;
    if (ids.length) {
      try {
        await this.ghiThanhVien(row.id, ids);
      } catch (e) {
        // Board 'private' mà không ghi được thành viên thì KHÔNG AI vào được,
        // kể cả người vừa tạo — dọn đi còn hơn để lại một board chết.
        await this.supabase.client.from('boards').delete().eq('id', row.id);
        throw e;
      }
    }
    return toBoard(row, ids);
  }

  /** Ai được chỉ định xem board này (dùng cho ô "Thành viên" trong phần cài đặt board). */
  async findMembers(uid: string, id: string): Promise<{ userId: string; user: unknown }[]> {
    const board = await this.findOne(uid, id);

    // Board mở cho cả workspace → "thành viên board" chính là thành viên workspace.
    if (board.visibility !== 'private') {
      const { data } = await this.supabase.client
        .from('workspaces')
        .select('org_id, visibility')
        .eq('id', board.workspaceId)
        .maybeSingle();
      const restricted = (data?.visibility as string) === 'restricted';
      const { data: rows } = restricted
        ? await this.supabase.client
            .from('workspace_members')
            .select('user_id, users(id, email, display_name, avatar_url)')
            .eq('workspace_id', board.workspaceId)
        : await this.supabase.client
            .from('organization_members')
            .select('user_id, users(id, email, display_name, avatar_url)')
            .eq('org_id', data?.org_id as string);
      return (rows ?? []).map((r) => ({ userId: r.user_id as string, user: toUser(r.users) }));
    }

    const { data: rows } = await this.supabase.client
      .from('board_members')
      .select('user_id, users(id, email, display_name, avatar_url)')
      .eq('board_id', id);
    return (rows ?? []).map((r) => ({ userId: r.user_id as string, user: toUser(r.users) }));
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
    changes: { name?: string; visibility?: string; memberIds?: string[] },
  ): Promise<unknown> {
    const current = await this.findOne(uid, id); // ném 404 nếu không tồn tại / khác tổ chức
    await this.assertCanManage(uid, current.orgId);

    if (changes.visibility !== undefined && !VISIBILITIES.includes(changes.visibility)) {
      throw new BadRequestException('visibility phải là workspace, private hoặc public.');
    }

    const patch: Record<string, string> = {};
    if (changes.name !== undefined) patch.name = changes.name.trim();
    if (changes.visibility !== undefined) patch.visibility = changes.visibility;

    const visibilityMoi = changes.visibility ?? current.visibility;

    // Ghi lại thành viên khi: client gửi danh sách, HOẶC board vừa chuyển sang
    // 'private' (lúc đó phải có ít nhất người tạo, không thì không ai vào được).
    const phaiGhiThanhVien =
      visibilityMoi === 'private' &&
      (changes.memberIds !== undefined || current.visibility !== 'private');

    let ids = await this.memberIdsOf(id);
    if (phaiGhiThanhVien) {
      ids = await this.locTheoWorkspace(current.workspaceId, current.createdBy, changes.memberIds ?? ids);
    }

    if (Object.keys(patch).length === 0 && !phaiGhiThanhVien) {
      throw new BadRequestException('Không có gì để cập nhật.');
    }

    let row: BoardRow = {
      id: current.id,
      org_id: current.orgId,
      workspace_id: current.workspaceId,
      name: current.name,
      visibility: current.visibility,
      background: current.background,
      background_image_path: current.backgroundImagePath,
      created_by: current.createdBy,
      created_at: current.createdAt,
    };

    if (Object.keys(patch).length > 0) {
      const { data, error } = await this.supabase.client
        .from('boards')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        throw new InternalServerErrorException('Không cập nhật được board.');
      }
      row = data as BoardRow;
    }

    if (phaiGhiThanhVien) await this.ghiThanhVien(id, ids);

    const updated = toBoard(row, ids);
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
