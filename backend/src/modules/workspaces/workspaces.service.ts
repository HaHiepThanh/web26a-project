import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

/** Vai trò của user trong tổ chức — đọc từ `organization_members`. */
export type OrgRole = 'owner' | 'admin' | 'member';

/** Dòng thô của bảng `workspaces` — tên cột snake_case như trong database. */
interface WorkspaceRow {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
}

/** Hình dạng API trả ra ngoài — camelCase. */
export interface WorkspaceResponse {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
}

/**
 * CRUD workspace bên trong 1 tổ chức.
 *
 * Bảng (xem database.sql mục 4):
 *   workspaces        — id, org_id, name, description, created_by, created_at
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
      this.logger.error(`Kiểm tra thành viên thất bại (uid=${uid}, org=${orgId}): ${error.message}`);
      throw new InternalServerErrorException('Không kiểm tra được quyền truy cập');
    }
    if (!data) {
      throw new ForbiddenException('Bạn không thuộc tổ chức này.');
    }
    return data.role as OrgRole;
  }

  /** Đổi tên cột snake_case của Supabase sang camelCase mà API trả ra. */
  private toResponse(w: WorkspaceRow): WorkspaceResponse {
    return {
      id: w.id,
      orgId: w.org_id,
      name: w.name,
      description: w.description,
      createdBy: w.created_by,
      createdAt: w.created_at,
    };
  }

  /**
   * Danh sách workspace trong 1 tổ chức.
   *
   * Kiểm tra quyền TRƯỚC khi đọc: thiếu bước này thì chỉ cần đoán đúng orgId là
   * xem được toàn bộ workspace của công ty khác.
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
      this.logger.error(`Đọc workspace thất bại (org=${orgId}): ${error.message}`);
      throw new InternalServerErrorException('Không đọc được danh sách workspace');
    }

    return (data as WorkspaceRow[]).map((w) => this.toResponse(w));
  }

  /**
   * Tạo workspace mới; người tạo thành owner của workspace đó.
   *
   * Hai lần INSERT như POST /organizations: `workspaces` rồi `workspace_members`.
   */
  async create(uid: string, orgId: string, name: string, description?: string) {
    // 1. Kiểm tra quyền TRƯỚC khi ghi. Bỏ bước này là ai cũng tạo được workspace
    //    trong công ty người khác — chỉ cần đoán đúng orgId.
    await this.assertMember(uid, orgId);

    // 2. Tạo workspace. `created_by` lấy từ token, không lấy từ body.
    const { data: ws, error } = await this.supabase.client
      .from('workspaces')
      .insert({ org_id: orgId, name: name.trim(), description: description ?? '', created_by: uid })
      .select()
      .single();

    if (error) {
      this.logger.error(`Tạo workspace thất bại (uid=${uid}, org=${orgId}): ${error.message}`);
      throw new InternalServerErrorException('Không tạo được workspace');
    }

    // 3. Người tạo thành owner của workspace.
    const { error: memberError } = await this.supabase.client
      .from('workspace_members')
      .insert({ workspace_id: ws.id, user_id: uid, role: 'owner' });

    if (memberError) {
      // Dọn lại workspace vừa tạo, tránh để lại workspace không ai sở hữu.
      await this.supabase.client.from('workspaces').delete().eq('id', ws.id);
      this.logger.error(`Thêm owner thất bại, đã xoá workspace ${ws.id}: ${memberError.message}`);
      throw new InternalServerErrorException('Không tạo được workspace');
    }

    return this.toResponse(ws as WorkspaceRow);
  }

  /**
   * Tìm workspace theo id và xác nhận người gọi được phép đụng vào nó.
   *
   * ⚠️ Không thuộc tổ chức → ném 404 chứ KHÔNG phải 403. Trả 403 là vô tình xác
   * nhận "id này có thật, chỉ là bạn không có quyền" — người ngoài cứ dò uuid,
   * cái nào 403 là biết có tồn tại. Dữ liệu không thuộc về họ thì coi như không có.
   */
  private async findOwnedOr404(uid: string, id: string): Promise<WorkspaceRow> {
    const { data, error } = await this.supabase.client
      .from('workspaces')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      this.logger.error(`Đọc workspace thất bại (id=${id}): ${error.message}`);
      throw new InternalServerErrorException('Không đọc được workspace');
    }
    if (!data) {
      throw new NotFoundException('Không tìm thấy workspace.');
    }

    const ws = data as WorkspaceRow;
    try {
      await this.assertMember(uid, ws.org_id);
    } catch {
      throw new NotFoundException('Không tìm thấy workspace.');
    }
    return ws;
  }

  /**
   * Đổi tên / mô tả workspace. Chỉ ghi những trường được gửi lên.
   */
  async update(
    uid: string,
    id: string,
    changes: { name?: string; description?: string },
  ): Promise<WorkspaceResponse> {
    const current = await this.findOwnedOr404(uid, id);

    const patch: Record<string, string> = {};
    if (changes.name !== undefined) patch.name = changes.name.trim();
    if (changes.description !== undefined) patch.description = changes.description;

    // Không gửi trường nào thì khỏi gọi database, trả lại nguyên trạng.
    if (Object.keys(patch).length === 0) return this.toResponse(current);

    const { data, error } = await this.supabase.client
      .from('workspaces')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Sửa workspace thất bại (id=${id}): ${error.message}`);
      throw new InternalServerErrorException('Không sửa được workspace');
    }
    return this.toResponse(data as WorkspaceRow);
  }

  /**
   * Xoá workspace.
   *
   * Board / list / card bên trong tự đi theo nhờ ON DELETE CASCADE khai trong
   * database.sql — không phải tự xoá tay từng bảng.
   */
  async remove(uid: string, id: string): Promise<{ id: string; deleted: true }> {
    // Ném 404 cho cả hai trường hợp: không tồn tại, và thuộc tổ chức khác.
    await this.findOwnedOr404(uid, id);

    const { error } = await this.supabase.client.from('workspaces').delete().eq('id', id);

    if (error) {
      this.logger.error(`Xoá workspace thất bại (id=${id}): ${error.message}`);
      throw new InternalServerErrorException('Không xoá được workspace');
    }

    // Trả về id vừa xoá thay vì body rỗng, để client biết chắc đã xoá cái nào.
    return { id, deleted: true };
  }
}
