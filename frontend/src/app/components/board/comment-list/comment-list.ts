import { Component, computed, inject, input, signal } from '@angular/core';
import { User } from '../../../models';
import { CommentService } from '../../../services/comment.service';
import { BoardService, CURRENT_USER_ID, avatarColorFor, initialsOf } from '../../../services/board.service';
import { ActivityService } from '../../../services/activity.service';

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
  private readonly activityService = inject(ActivityService);

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
    this.commentService.addComment(this.cardId(), text);
    this.activityService.record(this.boardId(), this.cardId(), 'đã bình luận vào thẻ này');
    this.newCommentText.set('');
  }

  deleteComment(commentId: string): void {
    this.commentService.deleteComment(this.cardId(), commentId);
  }
}
