import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { Workspace } from '../models';

export type MockBoardPrivacy = 'Workspace' | 'Private' | 'Public';
export type MockBoardBgClass = 'bg-board-blue' | 'bg-board-purple' | 'bg-board-green' | 'bg-board-teal' | 'bg-board-orange';

export interface MockBoardSeed {
  id: string;
  title: string;
  tag: string;
  privacy: MockBoardPrivacy;
  badge: string;
  starred: boolean;
  bgClass: MockBoardBgClass;
}

export interface MockWorkspaceSeed {
  id: string;
  name: string;
  icon: string;
  membersCount: number;
  description: string;
  boards: MockBoardSeed[];
}

/**
 * Nguồn mock duy nhất cho workspace + board demo — trang Workspace (workspace.ts)
 * vẫn giữ state cục bộ có thể sửa (đổi sao, tạo board...) khởi tạo từ đây, còn
 * WorkspaceService/BoardService dùng đúng seed này để có "danh sách board của tôi"
 * dùng chung cho Dashboard Chat — chỉ 1 nơi định nghĩa dữ liệu, không có 2 bản
 * lệch nhau (xem plan "Board-listing data source").
 */
export function mockWorkspaceSeeds(): MockWorkspaceSeed[] {
  return [
    {
      id: 'ws-1',
      name: 'Đồ án Tốt nghiệp CNTT',
      icon: '🎓',
      membersCount: 4,
      description: 'Workspace quản lý toàn bộ các công việc nghiên cứu và phát triển phần mềm đồ án tốt nghiệp khóa K22.',
      boards: [
        { id: 'b-1', title: 'Hệ thống Quản lý Kanban', tag: 'ĐỒ ÁN TỐT NGHIỆP CNTT', privacy: 'Workspace', badge: 'KANBAN', starred: true, bgClass: 'bg-board-blue' },
        { id: 'b-2', title: 'Ứng dụng tìm trọ thông minh', tag: 'ĐỒ ÁN TỐT NGHIỆP CNTT', privacy: 'Private', badge: 'KANBAN', starred: false, bgClass: 'bg-board-green' },
        { id: 'b-3', title: 'Kế hoạch Tuần cá nhân', tag: 'ĐỒ ÁN TỐT NGHIỆP CNTT', privacy: 'Workspace', badge: 'KANBAN', starred: false, bgClass: 'bg-board-teal' },
      ],
    },
    {
      id: 'ws-2',
      name: 'Dự án Khởi nghiệp SaaS',
      icon: '🚀',
      membersCount: 2,
      description: 'Không gian làm việc cho dự án SaaS khởi nghiệp sinh viên.',
      boards: [{ id: 'b-4', title: 'Sản phẩm MVP v1.0', tag: 'DỰ ÁN KHỞI NGHIỆP SAAS', privacy: 'Public', badge: 'KANBAN', starred: true, bgClass: 'bg-board-purple' }],
    },
  ];
}

/** CRUD workspace trong tenant (#3). */
@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private readonly api = inject(ApiService); // TODO: gọi backend qua this.api (get/post/patch/delete)

  readonly workspaces = signal<Workspace[]>([]);

  async loadWorkspaces(tenantId: string): Promise<void> {
    this.workspaces.set(mockWorkspaceSeeds().map((w) => ({ id: w.id, tenantId, name: w.name, createdAt: new Date().toISOString() })));
  }

  // TODO: tạo workspace mới.
  async createWorkspace(tenantId: string, name: string): Promise<Workspace | null> {
    return null;
  }

  // TODO: đổi tên workspace.
  async updateWorkspace(id: string, name: string): Promise<void> {}

  // TODO: xoá workspace.
  async deleteWorkspace(id: string): Promise<void> {}
}
