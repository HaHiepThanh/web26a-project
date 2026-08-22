import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { User } from '../../../models';
import { CommentService } from '../../../services/comment.service';
import { BoardService, CURRENT_USER_ID, avatarColorFor, initialsOf } from '../../../services/board.service';

/** [BONUS #4] Bình luận trong card: thêm, xoá bình luận của chính mình. */
@Component({
  selector: 'app-comment-list',
  imports: [],
  templateUrl: './comment-list.html',
  styleUrl: './comment-list.css',
})
export class CommentList {
  private readonly commentService = inject(CommentService);
  private readonly boardService = inject(BoardService);

  readonly cardId = input.required<string>();
  readonly boardId = input.required<string>();

  readonly currentUserId = CURRENT_USER_ID;
  readonly members = this.boardService.members;

  readonly membersById = computed(() => {
    const map: Record<string, User | undefined> = {};
    for (const m of this.members()) map[m.id] = m;
    return map;
  });

  readonly comments = computed(() => this.commentService.commentsFor(this.cardId()));
  readonly newCommentText = signal('');

  constructor() {
    // Nạp bình luận từ backend mỗi khi mở một thẻ khác. Thiếu chỗ này thì thẻ cũ
    // luôn hiện rỗng — bình luận chỉ xuất hiện với thẻ vừa gõ trong phiên này.
    effect(() => {
      const id = this.cardId();
      if (id) void this.commentService.loadComments(id);
    });
  }

  /** Tên hiển thị lấy từ backend (đã join bảng `users`); không có thì dò trong
   *  roster thành viên như trước. */
  displayNameOf(comment: { userId: string; user?: User }): string {
    return comment.user?.displayName ?? comment.user?.email ?? this.userLabel(comment.userId);
  }

  userLabel(userId: string): string {
    const u = this.membersById()[userId];
    return u?.displayName ?? u?.email ?? 'Ai đó';
  }

  userInitials(userId: string): string {
    return initialsOf(this.userLabel(userId));
  }

  userColor(userId: string): string {
    return avatarColorFor(userId);
  }

  timeLabel(iso: string): string {
    return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }

  onInput(event: Event): void {
    this.newCommentText.set((event.target as HTMLTextAreaElement).value);
  }

  addComment(): void {
    const text = this.newCommentText().trim();
    if (!text) return;
    // Backend tự ghi activity log khi thêm bình luận — không gọi record() ở đây
    // nữa, nếu không nhật ký sẽ có 2 dòng cho cùng một hành động.
    void this.commentService.addComment(this.cardId(), text);
    this.newCommentText.set('');
  }

  deleteComment(commentId: string): void {
    void this.commentService.deleteComment(this.cardId(), commentId);
  }
}
