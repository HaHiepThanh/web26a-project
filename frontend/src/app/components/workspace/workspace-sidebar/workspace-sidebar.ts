import { Component, input, output } from '@angular/core';
import { WorkspaceItem } from '../../../mocks';

@Component({
  selector: 'app-workspace-sidebar',
  templateUrl: './workspace-sidebar.html',
  host: { class: 'block' },
})
export class WorkspaceSidebar {
  readonly workspaces = input<WorkspaceItem[]>([]);
  readonly activeWorkspaceId = input<string | null>(null);
  readonly totalBoardsCount = input<number>(0);

  readonly selectWorkspace = output<string | null>();
  readonly createWorkspace = output<void>();

  onSelectWorkspace(wsId: string | null): void {
    if (this.activeWorkspaceId() === wsId) {
      this.selectWorkspace.emit(null);
    } else {
      this.selectWorkspace.emit(wsId);
    }
  }
}
