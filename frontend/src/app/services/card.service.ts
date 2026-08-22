import { Injectable, computed, inject, signal } from '@angular/core';
import {
  ApiCard,
  Card,
  CardPriority,
  CreateCardInput,
} from '../models';
import { ApiService } from './api.service';
import { describeError } from './api-error.util';
import { CURRENT_USER_ID } from './board.service';

/** 5 trường mà PATCH /cards/:id nhận. Khai tường minh thay vì Record<string, unknown>
 *  để gõ sai tên trường là TypeScript báo ngay, không phải chờ backend trả 400. */
interface CardPatch {
  title?: string;
  description?: string;
  priority?: CardPriority;
  dueDate?: string;
  assigneeId?: string;
}

/** Số ngày tính là "sắp đến hạn" (#10, Mức 1 — chỉ tính toán tại chỗ, không cron job). */
const DUE_SOON_WINDOW_DAYS = 3;

/**
 * CRUD card + kéo thả giữa/trong list (#4) — GỌI BACKEND THẬT.
 *
 * Kéo-thả giữ optimistic update: đổi vị trí trên màn hình NGAY rồi mới gọi API,
 * hỏng thì trả về trạng thái cũ. Kéo thẻ mà phải chờ mạng mới thấy nó nhúc nhích
 * thì cảm giác rất tệ.
 */
@Injectable({ providedIn: 'root' })
export class CardService {
  private readonly api = inject(ApiService);

  // Map listId -> cards, tiện render theo cột.
  readonly cardsByList = signal<Record<string, Card[]>>({});
  /** id các card đang "lưu ngầm" — board hiển thị chấm nhấp nháy góc thẻ. */
  readonly savingCardIds = signal<ReadonlySet<string>>(new Set());
  /** id các card vừa rollback lỗi — board chạy animation shake rồi tự xoá khỏi set này. */
  readonly errorCardIds = signal<ReadonlySet<string>>(new Set());
  readonly lastError = signal<{ id: number; message: string } | null>(null);
  private errorSeq = 0;

  /** Board đang có dữ liệu card nạp trong bộ nhớ — public để Dashboard/Header biết
   *  đường link tới board khi hiển thị "việc của tôi" (#10). */
  readonly loadedBoardId = signal<string | null>(null);

  /** Đếm thẻ của "tôi" quá hạn / sắp đến hạn (#10, Mức 1 — không cron job, tính lại
   *  mỗi lần cardsByList đổi). Dùng cho banner ở board + badge 🔔 ở Header. */
  readonly myDueCounts = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    const soonLimit = new Date(today);
    soonLimit.setDate(soonLimit.getDate() + DUE_SOON_WINDOW_DAYS);
    const soonLimitStr = soonLimit.toISOString().slice(0, 10);

    let overdue = 0;
    let dueSoon = 0;
    for (const arr of Object.values(this.cardsByList())) {
      for (const c of arr) {
        if (c.assigneeId !== CURRENT_USER_ID || !c.dueDate) continue;
        if (c.dueDate < today) overdue++;
        else if (c.dueDate <= soonLimitStr) dueSoon++;
      }
    }
    return { overdue, dueSoon };
  });

  /** Toàn bộ thẻ gán cho "tôi" (bất kể hạn) — dùng cho mục "Việc của tôi" ở Dashboard (#10). */
  readonly myCards = computed(() => Object.values(this.cardsByList()).flat().filter((c) => c.assigneeId === CURRENT_USER_ID));

  /** Backend trả 1 mảng phẳng mọi thẻ của board; giao diện cần gom theo cột. */
  private toCard(r: ApiCard): Card {
    return {
      id: r.id,
      orgId: r.orgId,
      listId: r.listId,
      title: r.title,
      description: r.description ?? undefined,
      priority: r.priority,
      assigneeId: r.assigneeId ?? undefined,
      dueDate: r.dueDate ?? undefined,
      position: r.position,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private fail(message: string): void {
    this.errorSeq++;
    this.lastError.set({ id: this.errorSeq, message });
  }

  async loadCards(boardId: string, force = false): Promise<void> {
    if (!boardId) {
      this.cardsByList.set({});
      return;
    }
    if (!force && this.loadedBoardId() === boardId) return;
    this.loadedBoardId.set(boardId);
    try {
      const rows = await this.api.get<ApiCard[]>(`/cards?boardId=${boardId}`);
      const grouped: Record<string, Card[]> = {};
      for (const r of rows) {
        const c = this.toCard(r);
        (grouped[c.listId] ??= []).push(c);
      }
      for (const listId of Object.keys(grouped)) {
        grouped[listId].sort((a, b) => a.position - b.position);
      }
      this.cardsByList.set(grouped);
    } catch (e) {
      this.cardsByList.set({});
      this.fail(describeError(e, 'Không tải được danh sách thẻ.'));
    }
  }

  async createCard(listId: string, input: CreateCardInput): Promise<Card | null> {
    const title = input.title.trim();
    if (!title) return null;

    try {
      // POST /cards chỉ nhận listId + title; id và position do SERVER cấp.
      const row = await this.api.post<ApiCard>('/cards', { listId, title });

      // Các trường còn lại gửi ở bước hai. Hỏng thì thẻ vẫn tồn tại với giá trị
      // mặc định — báo cho người dùng chứ không nuốt lỗi.
      const patch: CardPatch = {};
      if (input.description?.trim()) patch.description = input.description.trim();
      if (input.priority && input.priority !== 'medium') patch.priority = input.priority;
      if (input.assigneeId) patch.assigneeId = input.assigneeId;
      if (input.dueDate) patch.dueDate = input.dueDate;

      let final = row;
      if (Object.keys(patch).length > 0) {
        try {
          final = await this.api.patch<ApiCard>(`/cards/${row.id}`, patch);
        } catch {
          this.fail('Đã tạo thẻ nhưng chưa lưu được đầy đủ chi tiết.');
        }
      }

      const card = this.toCard(final);
      this.cardsByList.update((map) => ({ ...map, [listId]: [...(map[listId] ?? []), card] }));
      return card;
    } catch (e) {
      this.fail(describeError(e, 'Không tạo được thẻ.'));
      return null;
    }
  }

  async updateCard(id: string, changes: Partial<Card>): Promise<void> {
    const previous = this.cardsByList();

    // Cập nhật giao diện trước cho mượt, hỏng thì trả lại nguyên trạng.
    this.cardsByList.update((map) => {
      const next: Record<string, Card[]> = { ...map };
      for (const listId of Object.keys(next)) {
        next[listId] = next[listId].map((c) => (c.id === id ? { ...c, ...changes } : c));
      }
      return next;
    });

    // Chỉ 5 trường này backend nhận; gửi thừa sẽ bị ValidationPipe loại bỏ.
    const patch: CardPatch = {};
    if (changes.title !== undefined) patch.title = changes.title;
    if (changes.description !== undefined) patch.description = changes.description;
    if (changes.priority !== undefined) patch.priority = changes.priority;
    if (changes.dueDate !== undefined) patch.dueDate = changes.dueDate;
    if (changes.assigneeId !== undefined) patch.assigneeId = changes.assigneeId;
    if (Object.keys(patch).length === 0) return;

    try {
      await this.api.patch<ApiCard>(`/cards/${id}`, patch);
    } catch (e) {
      this.cardsByList.set(previous);
      this.fail(describeError(e, 'Không lưu được thay đổi của thẻ.'));
    }
  }

  async deleteCard(id: string, listId: string): Promise<void> {
    const previous = this.cardsByList();
    this.cardsByList.update((map) => ({ ...map, [listId]: (map[listId] ?? []).filter((c) => c.id !== id) }));
    try {
      await this.api.delete(`/cards/${id}`);
    } catch (e) {
      this.cardsByList.set(previous);
      this.fail(describeError(e, 'Không xoá được thẻ.'));
    }
  }

  /** Xoá toàn bộ card của 1 list (khi xoá list kèm thẻ bên trong). */
  clearListCards(listId: string): void {
    this.cardsByList.update((map) => {
      const next = { ...map };
      delete next[listId];
      return next;
    });
  }

  /** Kéo-thả card giữa/trong list (#3) — và tuỳ chọn đổi luôn mức ưu tiên khi kéo
   *  giữa các ô swimlane (#6, đổi cả 2 trục cùng lúc): cập nhật vị trí ngay, lưu
   *  ngầm phía sau, hoàn tác + đánh dấu lỗi trên đúng thẻ nếu "lưu" thất bại. */
  async moveCardOptimistic(cardId: string, fromListId: string, toListId: string, newIndex: number, newPriority?: CardPriority): Promise<void> {
    const previous = this.cardsByList();

    const fromArr = [...(previous[fromListId] ?? [])];
    const idx = fromArr.findIndex((c) => c.id === cardId);
    if (idx === -1) return;
    const [moving] = fromArr.splice(idx, 1);

    const toArr = fromListId === toListId ? fromArr : [...(previous[toListId] ?? [])];
    const movedCard: Card = { ...moving, listId: toListId, priority: newPriority ?? moving.priority };
    const clampedIndex = Math.max(0, Math.min(newIndex, toArr.length));
    toArr.splice(clampedIndex, 0, movedCard);

    const next: Record<string, Card[]> = {
      ...previous,
      [fromListId]: fromArr.map((c, i) => ({ ...c, position: i })),
      [toListId]: toArr.map((c, i) => ({ ...c, position: i })),
    };
    this.cardsByList.set(next);
    this.savingCardIds.update((s) => new Set(s).add(cardId));

    // `position` là số THỰC nên chỉ cần đổi ĐÚNG MỘT thẻ — thẻ được kéo — bằng
    // cách lấy trung bình position của hai thẻ hàng xóm ở vị trí đích. Không phải
    // đánh số lại cả cột, và cũng không gửi đại chỉ số 0,1,2: các thẻ khác đang
    // giữ position nào thì chỉ danh sách hiện tại mới biết.
    const neighbours = toArr.filter((c) => c.id !== cardId);
    const before = neighbours[clampedIndex - 1];
    const after = neighbours[clampedIndex];
    let position: number;
    if (!before) position = (after?.position ?? 1) - 1;
    else if (!after) position = before.position + 1;
    else position = (before.position + after.position) / 2;

    try {
      await this.api.patch<ApiCard>(`/cards/${cardId}/move`, { toListId, position });

      // Mức ưu tiên đổi theo swimlane là một thay đổi RIÊNG — endpoint move không
      // nhận nó, phải gọi thêm PATCH /cards/:id.
      if (newPriority && newPriority !== moving.priority) {
        await this.api.patch<ApiCard>(`/cards/${cardId}`, { priority: newPriority });
      }

      this.savingCardIds.update((s) => {
        const copy = new Set(s);
        copy.delete(cardId);
        return copy;
      });
    } catch (e) {
      this.cardsByList.set(previous);
      this.savingCardIds.update((s) => {
        const copy = new Set(s);
        copy.delete(cardId);
        return copy;
      });
      this.errorCardIds.update((s) => new Set(s).add(cardId));
      this.fail(
        describeError(e, `Không lưu được vị trí thẻ "${moving.title}" — đã hoàn tác.`),
      );
      setTimeout(() => {
        this.errorCardIds.update((s) => {
          const copy = new Set(s);
          copy.delete(cardId);
          return copy;
        });
      }, 500);
    }
  }
}

// Kiểu đã chuyển sang models/ — re-export để chỗ nào còn import từ đây vẫn chạy.
export type { CreateCardInput };
