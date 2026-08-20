import { Injectable, inject, signal } from '@angular/core';
import { List } from '../models';
import { MockNetworkService } from './mock-network.service';

let idSeq = 1;
function mockId(prefix: string): string {
  return `${prefix}-${Date.now()}-${idSeq++}`;
}

/** CRUD list + sắp xếp thứ tự list (kéo thả ngang) (#4). Dữ liệu giả tại chỗ, có
 *  optimistic update khi kéo-thả (#3): đổi thứ tự ngay trên UI, lưu ngầm qua
 *  MockNetworkService, hoàn tác nếu "lưu" thất bại. */
@Injectable({ providedIn: 'root' })
export class ListService {
  private readonly net = inject(MockNetworkService);

  readonly lists = signal<List[]>([]); // các list của board hiện tại, sort theo position
  /** Bắn 1 sự kiện mỗi khi optimistic reorder rollback — board.ts lắng nghe để show toast lỗi. */
  readonly lastError = signal<{ id: number; message: string } | null>(null);
  private errorSeq = 0;

  private loadedBoardId: string | null = null;

  async loadLists(boardId: string): Promise<void> {
    if (this.loadedBoardId === boardId) return;
    this.loadedBoardId = boardId;
    this.lists.set([]);
  }

  async createList(boardId: string, name: string): Promise<List | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const maxPos = this.lists().reduce((max, l) => Math.max(max, l.position), -1);
    const list: List = {
      id: mockId('list'),
      orgId: 'org-demo',
      boardId,
      name: trimmed,
      position: maxPos + 1,
      createdAt: new Date().toISOString(),
    };
    this.lists.update((all) => [...all, list]);
    return list;
  }

  async renameList(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.lists.update((all) => all.map((l) => (l.id === id ? { ...l, name: trimmed } : l)));
  }

  async deleteList(id: string): Promise<void> {
    this.lists.update((all) => all.filter((l) => l.id !== id));
  }

  /** Kéo-thả đổi thứ tự cột (#3): cập nhật UI ngay, rollback nếu "lưu" ngầm lỗi. */
  async reorderListOptimistic(orderedIds: string[]): Promise<void> {
    const previous = this.lists();
    const reordered = orderedIds
      .map((id, index) => {
        const list = previous.find((l) => l.id === id);
        return list ? { ...list, position: index } : null;
      })
      .filter((l): l is List => l !== null);

    this.lists.set(reordered);

    try {
      await this.net.simulateSave();
    } catch {
      this.lists.set(previous);
      this.errorSeq++;
      this.lastError.set({ id: this.errorSeq, message: 'Không lưu được thứ tự danh sách — đã hoàn tác.' });
    }
  }
}
