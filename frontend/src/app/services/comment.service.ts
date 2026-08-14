import { Injectable, computed, signal } from '@angular/core';
import { Comment } from '../models';
import { CURRENT_USER_ID } from './board.service';

let idSeq = 1;
function mockId(prefix: string): string {
  return `${prefix}-${Date.now()}-${idSeq++}`;
}

/** [BONUS #4] Bình luận trong card. Dữ liệu mock tại chỗ (chưa nối backend thật) —
 *  cùng phong cách với CardService: mutate signal ngay tại chỗ, không có round-trip
 *  mạng thật nên không cần trạng thái loading/optimistic-rollback. */
@Injectable({ providedIn: 'root' })
export class CommentService {
  readonly commentsByCard = signal<Record<string, Comment[]>>({});

  /** Số bình luận theo từng card — dùng để hiện badge 💬 ở mặt thẻ ngoài danh sách. */
  readonly countByCard = computed(() => {
    const result: Record<string, number | undefined> = {};
    for (const [cardId, list] of Object.entries(this.commentsByCard())) {
      if (list.length) result[cardId] = list.length;
    }
    return result;
  });

  commentsFor(cardId: string): Comment[] {
    return [...(this.commentsByCard()[cardId] ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  addComment(cardId: string, content: string): void {
    const text = content.trim();
    if (!text) return;
    const comment: Comment = { id: mockId('comment'), cardId, userId: CURRENT_USER_ID, content: text, createdAt: new Date().toISOString() };
    this.commentsByCard.update((map) => ({ ...map, [cardId]: [...(map[cardId] ?? []), comment] }));
  }

  /** Chỉ tác giả mới xoá được — component gọi hàm này chỉ khi userId khớp CURRENT_USER_ID. */
  deleteComment(cardId: string, commentId: string): void {
    this.commentsByCard.update((map) => ({ ...map, [cardId]: (map[cardId] ?? []).filter((c) => c.id !== commentId) }));
  }

  /** Xoá toàn bộ bình luận của 1 card (khi xoá card). */
  clearCard(cardId: string): void {
    this.commentsByCard.update((map) => {
      const next = { ...map };
      delete next[cardId];
      return next;
    });
  }
}
