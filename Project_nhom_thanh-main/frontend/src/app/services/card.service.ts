import { Injectable, computed, inject, signal } from '@angular/core';
import { Card, CardPriority } from '../models';
import { MockNetworkService } from './mock-network.service';
import { CURRENT_USER_ID } from './board.service';

/** Số ngày tính là "sắp đến hạn" (#10, Mức 1 — chỉ tính toán tại chỗ, không cron job). */
const DUE_SOON_WINDOW_DAYS = 3;

let idSeq = 1;
function mockId(prefix: string): string {
  return `${prefix}-${Date.now()}-${idSeq++}`;
}

export interface CreateCardInput {
  title: string;
  priority: CardPriority;
  assigneeId?: string;
  dueDate?: string;
  labelId?: string | null;
}

function mockCards(boardId: string, listIdByIndex: string[]): Record<string, Card[]> {
  const now = new Date().toISOString();
  const make = (listId: string, title: string, priority: CardPriority, assigneeId?: string, dueDate?: string, position = 0): Card => ({
    id: mockId('card'),
    tenantId: 'tenant-demo',
    listId,
    title,
    priority,
    assigneeId,
    dueDate,
    position,
    createdBy: 'u-nam',
    createdAt: now,
    updatedAt: now,
  });

  const [todo, doing, review, done] = listIdByIndex;
  const byList: Record<string, Card[]> = {};
  if (todo) {
    byList[todo] = [
      make(todo, 'Thiết kế wireframe trang chủ', 'cao', 'u-linh', '2026-08-05', 0),
      make(todo, 'Viết API xác thực người dùng', 'trung', 'u-khoa', '2026-08-10', 1),
      make(todo, 'Chuẩn hoá style guide UI', 'thap', 'u-my', undefined, 2),
    ];
  }
  if (doing) {
    byList[doing] = [
      make(doing, 'Review pull request #482', 'trung', 'u-nam', '2026-08-04', 0),
      make(doing, 'Tối ưu tốc độ tải trang', 'cao', 'u-bao', '2026-08-03', 1),
    ];
  }
  if (review) {
    byList[review] = [make(review, 'Kiểm thử luồng thanh toán', 'cao', 'u-khoa', '2026-08-06', 0)];
  }
  if (done) {
    byList[done] = [make(done, 'Chuẩn bị demo cho khách hàng', 'trung', 'u-linh', '2026-08-01', 0)];
  }
  return byList;
}

/** CRUD card + kéo thả giữa/trong list (#4), optimistic update khi kéo-thả (#3):
 *  UI cập nhật ngay, lưu ngầm qua MockNetworkService, rollback + báo lỗi nếu "lưu" thất bại. */
@Injectable({ providedIn: 'root' })
export class CardService {
  private readonly net = inject(MockNetworkService);

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

  async loadCards(boardId: string, listIdByIndex: string[]): Promise<void> {
    if (this.loadedBoardId() === boardId) return;
    this.loadedBoardId.set(boardId);
    this.cardsByList.set(mockCards(boardId, listIdByIndex));
  }

  async createCard(listId: string, input: CreateCardInput): Promise<Card | null> {
    const title = input.title.trim();
    if (!title) return null;
    const now = new Date().toISOString();
    const existing = this.cardsByList()[listId] ?? [];
    const card: Card = {
      id: mockId('card'),
      tenantId: 'tenant-demo',
      listId,
      title,
      priority: input.priority,
      assigneeId: input.assigneeId,
      dueDate: input.dueDate,
      position: existing.length,
      createdBy: CURRENT_USER_ID,
      createdAt: now,
      updatedAt: now,
    };
    this.cardsByList.update((map) => ({ ...map, [listId]: [...existing, card] }));
    return card;
  }

  async updateCard(id: string, changes: Partial<Card>): Promise<void> {
    this.cardsByList.update((map) => {
      const next: Record<string, Card[]> = { ...map };
      for (const listId of Object.keys(next)) {
        next[listId] = next[listId].map((c) => (c.id === id ? { ...c, ...changes } : c));
      }
      return next;
    });
  }

  async deleteCard(id: string, listId: string): Promise<void> {
    this.cardsByList.update((map) => ({ ...map, [listId]: (map[listId] ?? []).filter((c) => c.id !== id) }));
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

    try {
      await this.net.simulateSave();
      this.savingCardIds.update((s) => {
        const copy = new Set(s);
        copy.delete(cardId);
        return copy;
      });
    } catch {
      this.cardsByList.set(previous);
      this.savingCardIds.update((s) => {
        const copy = new Set(s);
        copy.delete(cardId);
        return copy;
      });
      this.errorCardIds.update((s) => new Set(s).add(cardId));
      this.errorSeq++;
      this.lastError.set({ id: this.errorSeq, message: `Không lưu được vị trí thẻ "${moving.title}" — đã hoàn tác.` });
      setTimeout(() => {
        this.errorCardIds.update((s) => {
          const copy = new Set(s);
          copy.delete(cardId);
          return copy;
        });
      }, 500);
    }
  }

  /** Kéo-thả tự do trên canvas "2 chiều" (#6, đã đổi trục sang vị trí ngang/dọc riêng
   *  của thẻ, không còn gắn với trạng thái/ưu tiên nữa): chỉ cập nhật canvasX/canvasY,
   *  không đổi list/priority/position. Cùng khuôn optimistic + rollback như trên. */
  async moveCardCanvasPosition(cardId: string, x: number, y: number): Promise<void> {
    const previous = this.cardsByList();
    let listId: string | null = null;
    let title = '';
    for (const [lid, cards] of Object.entries(previous)) {
      if (cards.some((c) => c.id === cardId)) {
        listId = lid;
        title = cards.find((c) => c.id === cardId)!.title;
        break;
      }
    }
    if (!listId) return;

    this.cardsByList.update((map) => ({
      ...map,
      [listId!]: map[listId!].map((c) => (c.id === cardId ? { ...c, canvasX: x, canvasY: y } : c)),
    }));
    this.savingCardIds.update((s) => new Set(s).add(cardId));

    try {
      await this.net.simulateSave();
      this.savingCardIds.update((s) => {
        const copy = new Set(s);
        copy.delete(cardId);
        return copy;
      });
    } catch {
      this.cardsByList.set(previous);
      this.savingCardIds.update((s) => {
        const copy = new Set(s);
        copy.delete(cardId);
        return copy;
      });
      this.errorCardIds.update((s) => new Set(s).add(cardId));
      this.errorSeq++;
      this.lastError.set({ id: this.errorSeq, message: `Không lưu được vị trí thẻ "${title}" — đã hoàn tác.` });
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
