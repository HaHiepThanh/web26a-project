import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { Workspace } from '../models';

/** CRUD workspace trong tổ chức (#3). */
@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private readonly api = inject(ApiService); // TODO: gọi backend qua this.api (get/post/patch/delete)

  readonly workspaces = signal<Workspace[]>([]);

  // TODO: lấy danh sách workspace của tổ chức -> set workspaces.
  async loadWorkspaces(orgId: string): Promise<void> {}

  // TODO: tạo workspace mới.
  async createWorkspace(orgId: string, name: string): Promise<Workspace | null> {
    return null;
  }

  // TODO: đổi tên workspace.
  async updateWorkspace(id: string, name: string): Promise<void> {}

  // TODO: xoá workspace.
  async deleteWorkspace(id: string): Promise<void> {}
}
