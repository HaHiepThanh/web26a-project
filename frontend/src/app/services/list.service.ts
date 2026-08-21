import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { describeError } from './api-error.util';
import { List } from '../models';

/** Dòng backend trả về (snake_case — nguyên dòng Supabase). */
interface ApiList {
  id: string;
  org_id: string;
  board_id: string;
  name: string;
  position: number;
  created_at: string;
}

/**
 * CRUD list + sắp xếp thứ tự (kéo thả ngang) (#4) — GỌI BACKEND THẬT.
 *
 * Kéo-thả vẫn giữ optimistic update: đổi thứ tự trên màn hình NGAY, gọi API ngầm,
 * hỏng thì trả về trạng thái cũ. Kéo thả mà phải chờ mạng mới thấy cột nhúc nhích
 * thì cảm giác rất tệ.
 */
@Injectable({ providedIn: 'root' })
export class ListService {
  private readonly api = inject(ApiService);

  readonly lists = signal<List[]>([]); // các list của board hiện tại, sort theo position
  /** Bắn 1 sự kiện mỗi khi có lỗi — board.ts lắng nghe để hiện toast. */
  readonly lastError = signal<{ id: number; message: string } | null>(null);
  private errorSeq = 0;

  private loadedBoardId: string | null = null;

  private toList(r: ApiList): List {
    return {
      id: r.id,
      orgId: r.org_id,
      boardId: r.board_id,
      name: r.name,
      position: r.position,
      createdAt: r.created_at,
    };
  }

  private fail(message: string): void {
    this.errorSeq++;
    this.lastError.set({ id: this.errorSeq, message });
  }

  async loadLists(boardId: string, force = false): Promise<void> {
    if (!boardId) {
      this.lists.set([]);
      return;
    }
    if (!force && this.loadedBoardId === boardId) return;
    this.loadedBoardId = boardId;
    try {
      const rows = await this.api.get<ApiList[]>(`/lists?boardId=${boardId}`);
      this.lists.set(rows.map((r) => this.toList(r)));
    } catch (e) {
      this.lists.set([]);
      this.fail(describeError(e, 'Không tải được danh sách cột.'));
    }
  }

  async createList(boardId: string, name: string): Promise<List | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    try {
      // position do BACKEND tính (cột mới luôn về cuối) — client không tự đoán.
      const row = await this.api.post<ApiList>('/lists', { boardId, name: trimmed });
      const list = this.toList(row);
      this.lists.update((all) => [...all, list]);
      return list;
    } catch (e) {
      this.fail(describeError(e, 'Không tạo được cột.'));
      return null;
    }
  }

  async renameList(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    const previous = this.lists();
    this.lists.update((all) => all.map((l) => (l.id === id ? { ...l, name: trimmed } : l)));
    try {
      await this.api.patch<ApiList>(`/lists/${id}`, { name: trimmed });
    } catch (e) {
      this.lists.set(previous);
      this.fail(describeError(e, 'Không đổi được tên cột.'));
    }
  }

  async deleteList(id: string): Promise<void> {
    const previous = this.lists();
    this.lists.update((all) => all.filter((l) => l.id !== id));
    try {
      await this.api.delete(`/lists/${id}`);
    } catch (e) {
      this.lists.set(previous);
      this.fail(describeError(e, 'Không xoá được cột.'));
    }
  }

  /**
   * Kéo-thả đổi thứ tự cột: cập nhật giao diện ngay, gọi API ngầm, hỏng thì hoàn tác.
   *
   * `position` là số THỰC nên chỉ cần đổi ĐÚNG MỘT cột — cột được kéo — bằng cách
   * lấy trung bình position của hai cột hàng xóm ở vị trí đích. Không phải đánh số
   * lại cả danh sách, và cũng không được gửi đại một số nguyên: các cột khác đang
   * giữ position nào thì chỉ backend và danh sách hiện tại mới biết.
   */
  async reorderListOptimistic(orderedIds: string[]): Promise<void> {
    const previous = this.lists();

    // Cột nào vừa đổi chỗ so với thứ tự cũ?
    //
    // ⚠️ KHÔNG đoán bằng "vị trí đầu tiên khác nhau". Kéo A xuống cuối
    //    (A B C → B C A) thì vị trí 0 đã khác ngay, cách đoán đó kết luận nhầm
    //    là B di chuyển → tính ra position sai và cột nhảy ngược về chỗ cũ.
    //
    //    Cách đúng: thử bỏ từng cột ra khỏi CẢ HAI danh sách; cột nào bỏ đi mà
    //    phần còn lại của hai danh sách trùng khớp thì đó là cột được kéo.
    const oldOrder = previous.map((l) => l.id);
    const movedId = orderedIds.find((id) => {
      const conLaiCu = oldOrder.filter((x) => x !== id);
      const conLaiMoi = orderedIds.filter((x) => x !== id);
      return conLaiCu.every((x, i) => x === conLaiMoi[i]);
    });
    if (!movedId) return; // thả về đúng chỗ cũ — không có gì để lưu

    const destIndex = orderedIds.indexOf(movedId);
    const neighbours = orderedIds
      .filter((id) => id !== movedId)
      .map((id) => previous.find((l) => l.id === id))
      .filter((l): l is List => !!l);

    const before = neighbours[destIndex - 1];
    const after = neighbours[destIndex];

    let position: number;
    if (!before) position = (after?.position ?? 1) - 1; // thả lên đầu
    else if (!after) position = before.position + 1; // thả xuống cuối
    else position = (before.position + after.position) / 2; // chèn vào giữa

    this.lists.set(
      orderedIds
        .map((id) => {
          const l = previous.find((x) => x.id === id);
          return l ? { ...l, position: l.id === movedId ? position : l.position } : null;
        })
        .filter((l): l is List => l !== null),
    );

    try {
      await this.api.patch<ApiList>(`/lists/${movedId}/position`, { position });
    } catch (e) {
      this.lists.set(previous);
      this.fail(describeError(e, 'Không lưu được thứ tự cột — đã hoàn tác.'));
    }
  }
}
