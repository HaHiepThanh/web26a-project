import { Component, input, output, signal } from '@angular/core';
import { LucideBuilding2, LucideEllipsisVertical, LucideGlobe, LucideLock, LucidePencil, LucidePlus, LucideStar } from '@lucide/angular';
import { BoardItem, WorkspaceItem, avatarBgFor, initialsOf } from '../../../mocks';

@Component({
  selector: 'app-workspace-card-item',
  imports: [LucideBuilding2, LucideEllipsisVertical, LucideGlobe, LucideLock, LucidePencil, LucidePlus, LucideStar],
  templateUrl: './workspace-card-item.html',
  host: { class: 'block' },
})
export class WorkspaceCardItem {
  /** false = thành viên thường → ẩn các nút quản lý (backend vẫn chặn thật). */
  readonly canManage = input<boolean>(true);

  readonly workspace = input.required<WorkspaceItem>();
  /** Ảnh nền theo boardId (nguồn: BoardService) — tile chỉ tra để vẽ, không tự lưu. */
  readonly bgImageByBoardId = input<Record<string, string | undefined>>({});
  readonly confirmDeleteKey = input<string | null>(null);

  readonly editWorkspace = output<WorkspaceItem>();
  readonly createBoard = output<string>();
  readonly boardClick = output<BoardItem>();
  readonly editBoard = output<{ workspaceId: string; board: BoardItem }>();
  readonly toggleStar = output<string>();
  readonly deleteBoard = output<{ workspaceId: string; board: BoardItem }>();
  readonly confirmDeleteKeyChange = output<string | null>();

  readonly initialsOf = initialsOf;
  readonly avatarBgFor = avatarBgFor;

  /** Menu 3-chấm (Sửa/Xoá) đang mở cho board nào — state cục bộ, không cần đẩy ra ngoài. */
  readonly openMenuKey = signal<string | null>(null);

  toggleBoardMenu(key: string): void {
    this.openMenuKey.update((cur) => (cur === key ? null : key));
  }

  onEditBoard(board: BoardItem): void {
    this.openMenuKey.set(null);
    this.editBoard.emit({ workspaceId: this.workspace().id, board });
  }

  onAskDeleteBoard(key: string): void {
    this.openMenuKey.set(null);
    this.confirmDeleteKeyChange.emit(key);
  }

  onDeleteBoard(wsId: string, board: BoardItem): void {
    this.confirmDeleteKeyChange.emit(null);
    this.deleteBoard.emit({ workspaceId: wsId, board });
  }
}
