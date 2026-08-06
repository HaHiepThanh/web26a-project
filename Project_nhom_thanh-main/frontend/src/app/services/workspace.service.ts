import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { Workspace } from '../models';

/** CRUD workspace trong tenant (#3). */
@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private readonly api = inject(ApiService); // TODO: gọi backend qua this.api (get/post/patch/delete)

  readonly workspaces = signal<Workspace[]>([]);

  // TODO: lấy danh sách workspace của tenant -> set workspaces.
  async loadWorkspaces(tenantId: string): Promise<void> {}

  // TODO: tạo workspace mới.
  async createWorkspace(tenantId: string, name: string): Promise<Workspace | null> {
    return null;
  }

  // TODO: đổi tên workspace.
  async updateWorkspace(id: string, name: string): Promise<void> {}

  // TODO: xoá workspace.
  async deleteWorkspace(id: string): Promise<void> {}
}
