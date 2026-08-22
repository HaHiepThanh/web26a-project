import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { describeError } from './api-error.util';
import {
  ApiWorkspace,
  ApiWorkspaceMember,
  Workspace,
  WorkspaceVisibility,
} from '../models';
/**
 * CRUD workspace trong tổ chức — GỌI BACKEND THẬT.
 *
 * Backend tự kiểm tra người gọi có thuộc tổ chức không, nên ở đây không cần
 * (và không nên) kiểm tra lại quyền: client-side check chỉ để ẩn nút cho đẹp,
 * không chặn được ai.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private readonly api = inject(ApiService);

  readonly workspaces = signal<Workspace[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  private toModel(w: ApiWorkspace): Workspace {
    return {
      id: w.id,
      orgId: w.orgId,
      name: w.name,
      description: w.description ?? '',
      visibility: w.visibility ?? 'org',
      memberIds: w.memberIds ?? [],
      createdBy: w.createdBy,
      createdAt: w.createdAt,
    };
  }

  /**
   * VÙNG CHỌN thành viên cho board bên trong workspace này.
   *
   * Workspace mở cho cả tổ chức → trả toàn bộ thành viên tổ chức.
   * Workspace chỉ định → trả đúng những người được chỉ định.
   *
   * Backend quyết định trả gì, frontend không tự đoán — nhờ vậy ô "chỉ định
   * thành viên" khi tạo board không bao giờ xổ ra người không vào được workspace.
   */
  async loadMembers(workspaceId: string): Promise<ApiWorkspaceMember[]> {
    try {
      return await this.api.get<ApiWorkspaceMember[]>(`/workspaces/${workspaceId}/members`);
    } catch {
      return [];
    }
  }

  /** Nạp workspace của 1 tổ chức. Không có orgId thì dọn sạch danh sách. */
  async loadWorkspaces(orgId: string | null): Promise<void> {
    if (!orgId) {
      this.workspaces.set([]);
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const rows = await this.api.get<ApiWorkspace[]>(`/workspaces?orgId=${orgId}`);
      this.workspaces.set(rows.map((w) => this.toModel(w)));
    } catch (e) {
      this.loadError.set(describeError(e, 'Không tải được danh sách workspace.'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Tạo workspace. Trả `{ workspace }` khi thành công, `{ error }` khi hỏng. */
  async createWorkspace(
    orgId: string,
    name: string,
    description = '',
    visibility: WorkspaceVisibility = 'org',
    memberIds: string[] = [],
  ): Promise<{ workspace?: Workspace; error?: string }> {
    try {
      const row = await this.api.post<ApiWorkspace>('/workspaces', {
        orgId,
        name,
        description,
        visibility,
        // Chỉ gửi khi thật sự chỉ định — gửi kèm lúc 'org' là thừa, backend bỏ qua.
        ...(visibility === 'restricted' ? { memberIds } : {}),
      });
      const ws = this.toModel(row);
      this.workspaces.update((list) => [...list, ws]);
      return { workspace: ws };
    } catch (e) {
      return { error: describeError(e, 'Không tạo được workspace.') };
    }
  }

  /** Đổi tên / mô tả. Trả về thông báo lỗi, hoặc null nếu thành công. */
  async updateWorkspace(
    id: string,
    changes: {
      name?: string;
      description?: string;
      visibility?: WorkspaceVisibility;
      memberIds?: string[];
    },
  ): Promise<string | null> {
    try {
      const row = await this.api.patch<ApiWorkspace>(`/workspaces/${id}`, changes);
      const ws = this.toModel(row);
      this.workspaces.update((list) => list.map((w) => (w.id === id ? ws : w)));
      return null;
    } catch (e) {
      return describeError(e, 'Không sửa được workspace.');
    }
  }

  /**
   * Xoá workspace. Board/list/card bên trong tự đi theo (ON DELETE CASCADE ở database),
   * không cần xoá tay từng bảng.
   */
  async deleteWorkspace(id: string): Promise<string | null> {
    try {
      await this.api.delete(`/workspaces/${id}`);
      this.workspaces.update((list) => list.filter((w) => w.id !== id));
      return null;
    } catch (e) {
      return describeError(e, 'Không xoá được workspace.');
    }
  }
}
