import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

/** Vai trò của user trong tổ chức — đọc từ `organization_members`. */
export type OrgRole = 'owner' | 'admin' | 'member';

/**
 * Ai thấy được workspace này.
 *   'org'        — mọi thành viên trong tổ chức
 *   'restricted' — chỉ những người có tên trong `workspace_members`
 * Xem migrations/0003_*.sql.
 */
export type WorkspaceVisibility = 'org' | 'restricted';
const VISIBILITIES: WorkspaceVisibility[] = ['org', 'restricted'];

/** Dòng thô của bảng `workspaces` — tên cột snake_case như trong database. */
interface WorkspaceRow {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  visibility: WorkspaceVisibility;
  created_by: string;
  created_at: string;
}

/** Hình dạng API trả ra ngoài — camelCase. */
export interface WorkspaceResponse {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  visibility: WorkspaceVisibility;
  /** Người được chỉ định. Với `visibility: 'org'` thì mảng này rỗng — cả tổ chức thấy. */
  memberIds: string[];
  createdBy: string;
  createdAt: string;
}

/** Một người trong workspace, kèm hồ sơ để giao diện vẽ avatar. */
export interface WorkspaceMemberResponse {
  userId: string;
  role: 'owner' | 'member';
  joinedAt: string | null;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
}

interface JoinedUser {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
}

/**
 * CRUD workspace bên trong 1 tổ chức.
 *
 * Bảng:
 *   workspaces        — id, org_id, name, description, visibility, created_by
 *   workspace_members — workspace_id, user_id, role('owner'|'member')
 *
 * ⚠️ Mọi hàm đều nhận `uid` để KIỂM TRA người gọi có thuộc tổ chức không.
 *    Thiếu bước đó là user tổ chức A sửa được workspace của tổ chức B.
 */
@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Người gọi có thuộc tổ chức này không? Không thuộc thì ném 403 ngay.
   *
   * Backend dùng service_role key nên RLS bị bỏ qua hoàn toàn — database KHÔNG
   * tự chặn gì cả. Mọi ràng buộc "chỉ đọc dữ liệu tổ chức của mình" đều phải do
   * hàm này làm. Viết 1 lần, dùng lại ở mọi endpoint phía dưới.
   */
  private async assertMember(uid: string, orgId: string): Promise<OrgRole> {
    const { data, error } = await this.supabase.client
      .from('organization_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', uid)
      .maybeSingle(); // maybeSingle: không có dòng thì trả null, single() sẽ NÉM LỖI

    if (error) {
      this.logger.error(
        `Kiểm tra thành viên thất bại (uid=${uid}, org=${orgId}): ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to check access permissions',
      );
    }
    if (!data) {
      throw new ForbiddenException(
        'You are not a member of this organization.',
      );
    }
    return data.role as OrgRole;
  }

  /**
   * Chỉ owner/admin của tổ chức mới được TẠO / SỬA / XOÁ workspace và board.
   *
   * `member` chỉ được LÀM VIỆC bên trong board đã có: kéo thẻ, bình luận, chat,
   * gắn nhãn. Không có ranh giới này thì bất kỳ ai vào tổ chức cũng xoá được cả
   * workspace của phòng ban khác.
   *
   * ⚠️ Phải chặn ở BACKEND. Ẩn nút trên giao diện chỉ là cho gọn mắt — người
   *    dùng vẫn gọi thẳng API bằng token của họ được.
   */
  private async assertCanManage(uid: string, orgId: string): Promise<OrgRole> {
    const role = await this.assertMember(uid, orgId);
    if (role !== 'owner' && role !== 'admin') {
      throw new ForbiddenException(
        'Only the organization owner or an admin can manage workspaces.',
      );
    }
    return role;
  }

  /** Danh sách user_id đang có tên trong 1 workspace. */
  private async memberIdsOf(workspaceId: string): Promise<string[]> {
    const { data } = await this.supabase.client
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId);
    return (data ?? []).map((r) => r.user_id as string);
  }

  /** Đổi tên cột snake_case của Supabase sang camelCase mà API trả ra. */
  private toResponse(w: WorkspaceRow, memberIds: string[]): WorkspaceResponse {
    return {
      id: w.id,
      orgId: w.org_id,
      name: w.name,
      description: w.description,
      visibility: w.visibility ?? 'org',
      // Workspace mở cho cả tổ chức thì danh sách chỉ định không có ý nghĩa —
      // trả rỗng để giao diện khỏi hiểu nhầm là "chỉ 1 người này thấy".
      memberIds: (w.visibility ?? 'org') === 'restricted' ? memberIds : [],
      createdBy: w.created_by,
      createdAt: w.created_at,
    };
  }

  /**
   * Danh sách workspace trong 1 tổ chức mà NGƯỜI GỌI được phép thấy.
   *
   * Kiểm tra quyền TRƯỚC khi đọc: thiếu bước này thì chỉ cần đoán đúng orgId là
   * xem được toàn bộ workspace của công ty khác.
   *
   * Sau đó lọc thêm một tầng: workspace `restricted` chỉ hiện với người có tên
   * trong `workspace_members`. Lọc ở ĐÂY chứ không ở frontend — gửi cả danh sách
   * xuống rồi mới ẩn đi thì dữ liệu vẫn nằm trong phản hồi HTTP, mở tab Network
   * là đọc được hết.
   */
  async findAll(uid: string, orgId: string): Promise<WorkspaceResponse[]> {
    // Thiếu query param → trả mảng rỗng, KHÔNG phải 500. Trước đây `orgId` là
    // undefined được đưa thẳng xuống Postgres, nó ném `invalid input syntax for
    // type uuid: "undefined"` và lộ ra ngoài thành 500 khó hiểu.
    if (!orgId) return [];

    await this.assertMember(uid, orgId);

    const { data, error } = await this.supabase.client
      .from('workspaces')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at');

    if (error) {
      this.logger.error(
        `Đọc workspace thất bại (org=${orgId}): ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to load workspaces');
    }

    const rows = data as WorkspaceRow[];
    if (!rows.length) return [];

    // Một truy vấn cho TẤT CẢ workspace thay vì mỗi cái một truy vấn — 20 workspace
    // mà hỏi 20 lần thì mở trang Workspace chậm thấy rõ.
    const { data: memberRows } = await this.supabase.client
      .from('workspace_members')
      .select('workspace_id, user_id')
      .in(
        'workspace_id',
        rows.map((w) => w.id),
      );

    const byWorkspace = new Map<string, string[]>();
    for (const m of memberRows ?? []) {
      const key = m.workspace_id as string;
      byWorkspace.set(key, [
        ...(byWorkspace.get(key) ?? []),
        m.user_id as string,
      ]);
    }

    return rows
      .filter(
        (w) =>
          (w.visibility ?? 'org') === 'org' ||
          (byWorkspace.get(w.id) ?? []).includes(uid),
      )
      .map((w) => this.toResponse(w, byWorkspace.get(w.id) ?? []));
  }

  /**
   * Lọc danh sách id người được chỉ định: bỏ trùng, bỏ người KHÔNG thuộc tổ chức,
   * và luôn giữ lại người tạo.
   *
   * ⚠️ Không kiểm tra thì client gửi lên uuid bất kỳ là thêm được người ngoài
   *    công ty vào workspace — họ sẽ thấy toàn bộ board bên trong.
   */
  private async loc(
    orgId: string,
    creatorUid: string,
    memberIds: string[],
  ): Promise<string[]> {
    const wanted = [...new Set([creatorUid, ...(memberIds ?? [])])];

    const { data, error } = await this.supabase.client
      .from('organization_members')
      .select('user_id')
      .eq('org_id', orgId)
      .in('user_id', wanted);

    if (error) {
      this.logger.error(
        `Lọc thành viên thất bại (org=${orgId}): ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to check member list');
    }

    const hopLe = new Set((data ?? []).map((r) => r.user_id as string));
    const bo = wanted.filter((id) => !hopLe.has(id));
    if (bo.length) {
      throw new BadRequestException(
        `${bo.length} people are not members of this organization and cannot be added to the workspace.`,
      );
    }
    return wanted;
  }

  /** Ghi lại đúng tập thành viên mong muốn (xoá hết rồi thêm lại cho chắc chắn khớp). */
  private async ghiThanhVien(
    workspaceId: string,
    ownerUid: string,
    ids: string[],
  ): Promise<void> {
    const sb = this.supabase.client;
    await sb.from('workspace_members').delete().eq('workspace_id', workspaceId);

    const rows = ids.map((id) => ({
      workspace_id: workspaceId,
      user_id: id,
      role: id === ownerUid ? 'owner' : 'member',
    }));
    const { error } = await sb.from('workspace_members').insert(rows);
    if (error) {
      this.logger.error(
        `Ghi workspace_members thất bại (ws=${workspaceId}): ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to save member list');
    }
  }

  /**
   * Tạo workspace mới; người tạo luôn là owner của workspace đó.
   *
   * `visibility: 'org'`        → cả tổ chức thấy, `memberIds` bị bỏ qua.
   * `visibility: 'restricted'` → chỉ người trong `memberIds` (+ người tạo) thấy.
   */
  async create(
    uid: string,
    orgId: string,
    name: string,
    description?: string,
    visibility: WorkspaceVisibility = 'org',
    memberIds: string[] = [],
  ): Promise<WorkspaceResponse> {
    if (!VISIBILITIES.includes(visibility)) {
      throw new BadRequestException(
        "visibility must be 'org' or 'restricted'.",
      );
    }

    // 1. Kiểm tra quyền TRƯỚC khi ghi. Bỏ bước này là ai cũng tạo được workspace
    //    trong công ty người khác — chỉ cần đoán đúng orgId.
    await this.assertCanManage(uid, orgId);

    // 2. Lọc danh sách chỉ định TRƯỚC khi tạo workspace: sai thì hỏng ngay từ
    //    đầu, không để lại workspace nửa vời phải đi dọn.
    const ids =
      visibility === 'restricted'
        ? await this.loc(orgId, uid, memberIds)
        : [uid];

    // 2.5 Chống duplicate dữ liệu do spam click / concurrency (< 3 giây)
    const baGiayTruoc = new Date(Date.now() - 3000).toISOString();
    const { data: duplicateWs } = await this.supabase.client
      .from('workspaces')
      .select('*')
      .eq('org_id', orgId)
      .eq('name', name.trim())
      .eq('created_by', uid)
      .gte('created_at', baGiayTruoc)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (duplicateWs) {
      const existingMembers = await this.memberIdsOf(duplicateWs.id);
      return this.toResponse(duplicateWs as WorkspaceRow, existingMembers);
    }

    // 3. Tạo workspace. `created_by` lấy từ token, không lấy từ body.
    const { data: ws, error } = await this.supabase.client
      .from('workspaces')
      .insert({
        org_id: orgId,
        name: name.trim(),
        description: description ?? '',
        visibility,
        created_by: uid,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(
        `Tạo workspace thất bại (uid=${uid}, org=${orgId}): ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to create workspace');
    }

    // 4. Ghi thành viên. Hỏng thì dọn lại workspace vừa tạo, tránh để lại
    //    workspace `restricted` mà không ai vào được — kể cả người tạo.
    try {
      await this.ghiThanhVien(ws.id as string, uid, ids);
    } catch (e) {
      await this.supabase.client.from('workspaces').delete().eq('id', ws.id);
      throw e;
    }

    return this.toResponse(ws as WorkspaceRow, ids);
  }

  /**
   * Tìm workspace theo id và xác nhận người gọi được phép đụng vào nó.
   *
   * ⚠️ Không thuộc tổ chức → ném 404 chứ KHÔNG phải 403. Trả 403 là vô tình xác
   * nhận "id này có thật, chỉ là bạn không có quyền" — người ngoài cứ dò uuid,
   * cái nào 403 là biết có tồn tại. Dữ liệu không thuộc về họ thì coi như không có.
   *
   * Workspace `restricted` mà người gọi không có tên trong đó cũng ném 404 y hệt.
   */
  private async findOwnedOr404(uid: string, id: string): Promise<WorkspaceRow> {
    const { data, error } = await this.supabase.client
      .from('workspaces')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      // id gõ sai định dạng uuid → coi như không tồn tại, đừng để lọt thành 500.
      if (error.code === '22P02')
        throw new NotFoundException('Workspace not found.');
      this.logger.error(`Đọc workspace thất bại (id=${id}): ${error.message}`);
      throw new InternalServerErrorException('Failed to load workspace');
    }
    if (!data) {
      throw new NotFoundException('Workspace not found.');
    }

    const ws = data as WorkspaceRow;
    try {
      await this.assertMember(uid, ws.org_id);
    } catch {
      throw new NotFoundException('Workspace not found.');
    }

    if ((ws.visibility ?? 'org') === 'restricted') {
      const ids = await this.memberIdsOf(ws.id);
      if (!ids.includes(uid))
        throw new NotFoundException('Workspace not found.');
    }
    return ws;
  }

  /** Dùng cho module khác (boards): người này có vào được workspace không? */
  async assertAccess(uid: string, workspaceId: string): Promise<WorkspaceRow> {
    return this.findOwnedOr404(uid, workspaceId);
  }

  /** Ai đang ở trong workspace này — dùng cho ô chọn thành viên khi tạo board. */
  async findMembers(
    uid: string,
    id: string,
  ): Promise<WorkspaceMemberResponse[]> {
    const ws = await this.findOwnedOr404(uid, id);

    // Workspace mở cho cả tổ chức → "thành viên workspace" chính là mọi thành
    // viên tổ chức, không phải mấy dòng lẻ trong workspace_members.
    if ((ws.visibility ?? 'org') === 'org') {
      const { data, error } = await this.supabase.client
        .from('organization_members')
        .select(
          'user_id, joined_at, users(id, email, display_name, avatar_url)',
        )
        .eq('org_id', ws.org_id);
      if (error) {
        this.logger.error(
          `Đọc thành viên tổ chức thất bại (ws=${id}): ${error.message}`,
        );
        throw new InternalServerErrorException('Failed to load member list');
      }
      return (data ?? []).map((r) => ({
        userId: r.user_id as string,
        role: r.user_id === ws.created_by ? 'owner' : 'member',
        joinedAt: (r.joined_at as string) ?? null,
        user: this.toUser(r.users),
      }));
    }

    const { data, error } = await this.supabase.client
      .from('workspace_members')
      .select(
        'user_id, role, joined_at, users(id, email, display_name, avatar_url)',
      )
      .eq('workspace_id', id);
    if (error) {
      this.logger.error(
        `Đọc workspace_members thất bại (ws=${id}): ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to load member list');
    }
    return (data ?? []).map((r) => ({
      userId: r.user_id as string,
      role: (r.role as 'owner' | 'member') ?? 'member',
      joinedAt: (r.joined_at as string) ?? null,
      user: this.toUser(r.users),
    }));
  }

  private toUser(row: unknown): WorkspaceMemberResponse['user'] {
    const u = row as JoinedUser | null;
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      displayName: u.display_name,
      avatarUrl: u.avatar_url,
    };
  }

  /** Đổi tên / mô tả / phạm vi hiển thị / danh sách thành viên. Chỉ ghi trường được gửi lên. */
  async update(
    uid: string,
    id: string,
    changes: {
      name?: string;
      description?: string;
      visibility?: WorkspaceVisibility;
      memberIds?: string[];
    },
  ): Promise<WorkspaceResponse> {
    const current = await this.findOwnedOr404(uid, id);
    await this.assertCanManage(uid, current.org_id);

    if (
      changes.visibility !== undefined &&
      !VISIBILITIES.includes(changes.visibility)
    ) {
      throw new BadRequestException(
        "visibility must be 'org' or 'restricted'.",
      );
    }

    const patch: Record<string, string> = {};
    if (changes.name !== undefined) patch.name = changes.name.trim();
    if (changes.description !== undefined)
      patch.description = changes.description;
    if (changes.visibility !== undefined) patch.visibility = changes.visibility;

    const visibilityMoi = changes.visibility ?? current.visibility ?? 'org';

    // Danh sách thành viên ghi lại khi: được gửi lên, HOẶC vừa chuyển sang
    // 'restricted' (lúc đó phải có ít nhất người tạo, không thì không ai vào được).
    let ids = await this.memberIdsOf(id);
    const phaiGhiThanhVien =
      visibilityMoi === 'restricted' &&
      (changes.memberIds !== undefined ||
        (current.visibility ?? 'org') !== 'restricted');

    if (phaiGhiThanhVien) {
      ids = await this.loc(
        current.org_id,
        current.created_by,
        changes.memberIds ?? ids,
      );
    }

    // Không gửi trường nào thì khỏi gọi database, trả lại nguyên trạng.
    if (Object.keys(patch).length === 0 && !phaiGhiThanhVien) {
      return this.toResponse(current, ids);
    }

    let row = current;
    if (Object.keys(patch).length > 0) {
      const { data, error } = await this.supabase.client
        .from('workspaces')
        .update(patch)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        this.logger.error(
          `Sửa workspace thất bại (id=${id}): ${error.message}`,
        );
        throw new InternalServerErrorException('Failed to update workspace');
      }
      row = data as WorkspaceRow;
    }

    if (phaiGhiThanhVien) {
      await this.ghiThanhVien(id, current.created_by, ids);
    }

    return this.toResponse(row, ids);
  }

  /**
   * Xoá workspace.
   *
   * Board / list / card bên trong tự đi theo nhờ ON DELETE CASCADE khai trong
   * database.sql — không phải tự xoá tay từng bảng.
   */
  async remove(
    uid: string,
    id: string,
  ): Promise<{ id: string; deleted: true }> {
    // Ném 404 cho cả hai trường hợp: không tồn tại, và thuộc tổ chức khác.
    const ws = await this.findOwnedOr404(uid, id);
    await this.assertCanManage(uid, ws.org_id);

    const { error } = await this.supabase.client
      .from('workspaces')
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Xoá workspace thất bại (id=${id}): ${error.message}`);
      throw new InternalServerErrorException('Failed to delete workspace');
    }

    // Trả về id vừa xoá thay vì body rỗng, để client biết chắc đã xoá cái nào.
    return { id, deleted: true };
  }
}
