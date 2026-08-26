import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { User } from '../../../models';
import { CommentStore } from '../../../ngrx/comment/comment.store';
import { BoardStore } from '../../../ngrx/board/board.store';
import { AuthService } from '../../../services/auth.service';
import { UserAvatar } from '../../shared/user-avatar/user-avatar';

/**
 * Trần độ dài một bình luận.
 *
 * Phải khớp với `@MaxLength` trong `backend/.../create-comment.dto.ts` — backend
 * mới là nơi chặn thật (gọi thẳng API thì không đi qua giao diện). Chỗ này chỉ
 * để người dùng biết trước, thay vì gõ xong mới ăn lỗi 400.
 */
const MAX_COMMENT_LENGTH = 300;

/** Còn dưới ngần này ký tự thì hiện bộ đếm — hiện suốt từ ký tự đầu chỉ tổ
 *  chật ô nhập vốn đã nhỏ, mà lúc đó chẳng ai cần biết. */
const COUNTER_VISIBLE_FROM = 60;

/** [BONUS #4] Bình luận trong card: thêm, xoá bình luận của chính mình. */
@Component({
  selector: 'app-comment-list',
  imports: [UserAvatar],
  templateUrl: './comment-list.html',
  styleUrl: './comment-list.css',
})
export class CommentList {
  private readonly commentService = inject(CommentStore);
  private readonly boardService = inject(BoardStore);
  private readonly auth = inject(AuthService);

  readonly cardId = input.required<string>();
  readonly boardId = input.required<string>();

  /** uid thật của người đang đăng nhập — nút Xoá chỉ hiện trên bình luận của chính mình.
   *  (Backend vẫn chặn thêm lần nữa, đây chỉ để ẩn nút cho gọn.) */
  readonly currentUserId = this.auth.currentUserId;
  readonly members = this.boardService.members;

  readonly membersById = computed(() => {
    const map: Record<string, User | undefined> = {};
    for (const m of this.members()) map[m.id] = m;
    return map;
  });

  readonly comments = computed(() => this.commentService.commentsFor(this.cardId()));
  readonly newCommentText = signal('');

  readonly maxLength = MAX_COMMENT_LENGTH;
  /** Số ký tự còn lại. Âm nghĩa là đã vượt — chỉ xảy ra khi nội dung được đặt
   *  bằng đường khác `maxlength` của trình duyệt (dán qua script, tự động hoá). */
  readonly remaining = computed(() => MAX_COMMENT_LENGTH - this.newCommentText().length);
  readonly showCounter = computed(() => this.remaining() <= COUNTER_VISIBLE_FROM);
  readonly tooLong = computed(() => this.remaining() < 0);
  readonly canSend = computed(() => !!this.newCommentText().trim() && !this.tooLong());

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
    return u?.displayName ?? u?.email ?? 'Someone';
  }

  /** Ảnh backend trả kèm bình luận; thiếu thì dò trong roster thành viên. */
  avatarUrlOf(comment: { userId: string; user?: User }): string | undefined {
    return comment.user?.avatarUrl ?? this.membersById()[comment.userId]?.avatarUrl;
  }

  timeLabel(iso: string): string {
    return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }

  onInput(event: Event): void {
    this.newCommentText.set((event.target as HTMLTextAreaElement).value);
  }

  addComment(): void {
    const text = this.newCommentText().trim();
    // Chặn cả ở đây, không chỉ dựa vào `[disabled]` của nút: phím Enter cũng gọi
    // thẳng hàm này, mà nút bị vô hiệu hoá không ngăn được phím tắt.
    if (!text || text.length > MAX_COMMENT_LENGTH) return;
    // Backend tự ghi activity log khi thêm bình luận — không gọi record() ở đây
    // nữa, nếu không nhật ký sẽ có 2 dòng cho cùng một hành động.
    void this.commentService.addComment(this.cardId(), text);
    this.newCommentText.set('');
  }

  deleteComment(commentId: string): void {
    void this.commentService.deleteComment(this.cardId(), commentId);
  }
}
