import { Injectable, signal } from '@angular/core';

/**
 * Small cross-component UI state so the global Header (search box, "+ Tạo"
 * button) can drive the Workspace page's board grid/filter without a direct
 * component reference. Board/list/card data itself stays local to Workspace.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceUiService {
  readonly searchQuery = signal('');
  readonly createBoardRequests = signal(0);
  readonly createWorkspaceRequests = signal(0);

  setSearchQuery(value: string): void {
    this.searchQuery.set(value);
  }

  requestCreateBoard(): void {
    this.createBoardRequests.update((n) => n + 1);
  }

  requestCreateWorkspace(): void {
    this.createWorkspaceRequests.update((n) => n + 1);
  }
}

