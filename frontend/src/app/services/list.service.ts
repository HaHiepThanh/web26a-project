import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { List } from '../models';

/** CRUD list + sắp xếp thứ tự list (kéo thả ngang) (#4). */
@Injectable({ providedIn: 'root' })
export class ListService {
  private readonly api = inject(ApiService); // TODO: gọi backend qua this.api (get/post/patch/delete)

  readonly lists = signal<List[]>([]); // các list của board hiện tại, sort theo position

  // TODO: lấy list của board -> set lists (order by position).
  async loadLists(boardId: string): Promise<void> {}

  // TODO: tạo list mới (position = cuối cùng).
  async createList(boardId: string, name: string): Promise<List | null> {
    return null;
  }

  // TODO: đổi tên list.
  async renameList(id: string, name: string): Promise<void> {}

  // TODO: xoá list.
  async deleteList(id: string): Promise<void> {}

  // TODO: cập nhật position sau khi kéo thả (tính position mới = trung bình 2 list kề).
  async reorderList(id: string, newPosition: number): Promise<void> {}
}
