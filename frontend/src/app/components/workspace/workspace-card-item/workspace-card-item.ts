import { Component, input, output } from '@angular/core';
import { BoardItem, WorkspaceItem, avatarBgFor, initialsOf } from '../../../mocks';

@Component({
  selector: 'app-workspace-card-item',
  templateUrl: './workspace-card-item.html',
  host: { class: 'block' },
})
export class WorkspaceCardItem {
  readonly workspace = input.required<WorkspaceItem>();
  readonly confirmDeleteKey = input<string | null>(null);

  readonly editWorkspace = output<WorkspaceItem>();
  readonly createBoard = output<string>();
  readonly boardClick = output<BoardItem>();
  readonly toggleStar = output<string>();
  readonly deleteBoard = output<{ workspaceId: string; board: BoardItem }>();
  readonly confirmDeleteKeyChange = output<string | null>();

  readonly initialsOf = initialsOf;
  readonly avatarBgFor = avatarBgFor;

  onDeleteBoard(wsId: string, board: BoardItem): void {
    this.confirmDeleteKeyChange.emit(null);
    this.deleteBoard.emit({ workspaceId: wsId, board });
  }
}
