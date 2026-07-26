import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { Board, BoardVisibility } from '../models';

/** CRUD board + visibility (#3). */
@Injectable({ providedIn: 'root' })
export class BoardService {
  private readonly api = inject(ApiService); // TODO: gọi backend qua this.api (get/post/patch/delete)

  readonly boards = signal<Board[]>([]); // danh sách board trong 1 workspace
  readonly currentBoard = signal<Board | null>(null);

  // TODO: lấy các board của workspace (grid) — kèm số card/member để hiển thị.
  async loadBoards(workspaceId: string): Promise<void> {}

  // TODO: lấy 1 board theo id (mở trang /board/:id) -> set currentBoard.
  async loadBoard(boardId: string): Promise<void> {}

  // TODO: tạo board mới trong workspace.
  async createBoard(workspaceId: string, name: string): Promise<Board | null> {
    return null;
  }

  // TODO: sửa tên / visibility board.
  async updateBoard(id: string, changes: Partial<Pick<Board, 'name' | 'visibility'>>): Promise<void> {}

  // TODO: xoá board — chỉ owner (#7).
  async deleteBoard(id: string): Promise<void> {}
}
