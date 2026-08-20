import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

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
  constructor(private readonly supabase: SupabaseService) {}

  /** TODO: list workspace theo org_id — chỉ khi `uid` là thành viên tổ chức đó. */
  async findAll(uid: string, orgId: string): Promise<unknown[]> {
    return [];
  }

  /** TODO: tạo workspace + thêm người tạo vào workspace_members với role 'owner'. */
  async create(
    uid: string,
    orgId: string,
    name: string,
    description?: string,
  ): Promise<unknown> {
    return null;
  }

  /** TODO: đổi tên/mô tả. Không tìm thấy hoặc khác tổ chức → 404. */
  async update(
    uid: string,
    id: string,
    changes: { name?: string; description?: string },
  ): Promise<unknown> {
    return null;
  }

  /** TODO: xoá workspace. Kiểm tra quyền trước khi xoá. */
  async remove(uid: string, id: string): Promise<unknown> {
    return null;
  }
}
