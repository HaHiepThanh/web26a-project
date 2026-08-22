import { Component, input, output } from '@angular/core';
import { LucideEllipsisVertical, LucideFolderKanban, LucidePlus } from '@lucide/angular';
import { WorkspaceItem } from '../../../mocks';

/** Danh sách Workspace ở sidebar — CHỈ lọc/chuyển đổi + tạo mới.
 *  Quản lý chi tiết (đổi tên, icon, thêm/xoá thành viên, xoá workspace) mở
 *  bằng nút 3 chấm → app-workspace-form-modal, để sidebar luôn gọn và nút
 *  "Tạo Không gian mới" không bị đẩy khỏi tầm nhìn. */
@Component({
  selector: 'app-workspace-sidebar',
  imports: [LucideEllipsisVertical, LucideFolderKanban, LucidePlus],
  templateUrl: './workspace-sidebar.html',
  host: { class: 'block' },
})
export class WorkspaceSidebar {
  /** false = thành viên thường → ẩn các nút quản lý (backend vẫn chặn thật). */
  readonly canManage = input<boolean>(true);

  readonly workspaces = input<WorkspaceItem[]>([]);
  readonly activeWorkspaceId = input<string | null>(null);
  readonly totalBoardsCount = input<number>(0);

  readonly selectWorkspace = output<string | null>();
  readonly createWorkspace = output<void>();
  readonly manageWorkspace = output<WorkspaceItem>();

  onSelectWorkspace(wsId: string | null): void {
    if (this.activeWorkspaceId() === wsId) {
      this.selectWorkspace.emit(null);
    } else {
      this.selectWorkspace.emit(wsId);
    }
  }

  onManage(ws: WorkspaceItem, event: Event): void {
    event.stopPropagation();
    this.manageWorkspace.emit(ws);
  }
}
