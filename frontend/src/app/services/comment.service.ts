import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiComment, ApiCreatedComment, Comment } from '../models';
import { ApiService } from './api.service';
import { describeError } from './api-error.util';
import { AuthService } from './auth.service';

/**
 * [BONUS #4] Bình luận trong card — GỌI BACKEND THẬT.
 *
 * `commentsByCard` chỉ giữ bình luận của những thẻ đã mở, nạp theo yêu cầu
 * (`loadComments`) chứ không tải sẵn cả board: một board có thể có hàng trăm thẻ.
 */
@Injectable({ providedIn: 'root' })
export class CommentService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly commentsByCard = signal<Record<string, Comment[]>>({});
  readonly lastError = signal<{ id: number; message: string } | null>(null);
  private errorSeq = 0;

  /** Số bình luận theo từng card — dùng để hiện badge 💬 ở mặt thẻ ngoài danh sách. */
  readonly countByCard = computed(() => {
    const result: Record<string, number | undefined> = {};
    for (const [cardId, list] of Object.entries(this.commentsByCard())) {
      if (list.length) result[cardId] = list.length;
    }
    return result;
  });

  private fail(message: string): void {
    this.errorSeq++;
    this.lastError.set({ id: this.errorSeq, message });
  }

  commentsFor(cardId: string): Comment[] {
    return [...(this.commentsByCard()[cardId] ?? [])].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
  }

  /** Nạp bình luận của 1 thẻ. Gọi khi mở modal chi tiết thẻ. */
  async loadComments(cardId: string): Promise<void> {
    if (!cardId) return;
    try {
      const rows = await this.api.get<ApiComment[]>(`/comments?cardId=${cardId}`);
      // Backend join sang `users` nên trả kèm tên/ảnh; model `Comment` chỉ cần
      // userId, còn tên hiển thị lấy từ khối `user` khi vẽ.
      this.commentsByCard.update((map) => ({
        ...map,
        [cardId]: rows.map((r) => ({
          id: r.id,
          cardId,
          userId: r.userId,
          content: r.content,
          createdAt: r.createdAt,
          user: r.user
            ? {
                id: r.userId,
                email: '',
                displayName: r.user.displayName ?? undefined,
                avatarUrl: r.user.avatarUrl ?? undefined,
              }
            : undefined,
        })) as Comment[],
      }));
    } catch (e) {
      this.fail(describeError(e, 'Không tải được bình luận.'));
    }
  }

  async addComment(cardId: string, content: string): Promise<void> {
    const text = content.trim();
    if (!text) return;
    try {
      const row = await this.api.post<ApiCreatedComment>('/comments', { cardId, content: text });
      const me = this.auth.currentUser();
      const comment = {
        id: row.id,
        cardId,
        userId: row.userId,
        content: row.content,
        createdAt: row.createdAt,
        user: me ?? undefined,
      } as Comment;
      // Upsert theo id — sự kiện `comment.created` có thể về trước phản hồi HTTP.
      this.commentsByCard.update((map) => {
        const current = map[cardId] ?? [];
        if (current.some((c) => c.id === comment.id)) return map;
        return { ...map, [cardId]: [...current, comment] };
      });
    } catch (e) {
      this.fail(describeError(e, 'Không gửi được bình luận.'));
    }
  }

  /**
   * Áp bình luận nhận từ WebSocket.
   *
   * Chỉ nạp vào những thẻ ĐÃ mở (`cardId` đã có trong map). Thẻ chưa mở thì bỏ
   * qua: lần đầu mở thẻ đó `loadComments()` sẽ lấy đủ từ server — giữ sẵn bình
   * luận cho cả trăm thẻ chỉ để phòng hờ là phí bộ nhớ.
   */
  applyRemoteComment(comment: Comment): void {
    this.commentsByCard.update((map) => {
      const current = map[comment.cardId];
      if (!current) return map;
      if (current.some((c) => c.id === comment.id)) return map;
      return { ...map, [comment.cardId]: [...current, comment] };
    });
  }

  applyRemoteCommentDeleted(cardId: string, commentId: string): void {
    this.commentsByCard.update((map) => {
      const current = map[cardId];
      if (!current) return map;
      return { ...map, [cardId]: current.filter((c) => c.id !== commentId) };
    });
  }

  /** Backend chỉ cho TÁC GIẢ xoá — người khác gọi sẽ nhận 403, không phải kiểm tra ở đây. */
  async deleteComment(cardId: string, commentId: string): Promise<void> {
    const previous = this.commentsByCard();
    this.commentsByCard.update((map) => ({
      ...map,
      [cardId]: (map[cardId] ?? []).filter((c) => c.id !== commentId),
    }));
    try {
      await this.api.delete(`/comments/${commentId}`);
    } catch (e) {
      this.commentsByCard.set(previous);
      this.fail(describeError(e, 'Không xoá được bình luận.'));
    }
  }

  /** Dọn bình luận của 1 card khỏi bộ nhớ (khi xoá card) — database tự cascade. */
  clearCard(cardId: string): void {
    this.commentsByCard.update((map) => {
      const next = { ...map };
      delete next[cardId];
      return next;
    });
  }
}
