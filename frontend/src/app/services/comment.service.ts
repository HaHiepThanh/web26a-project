import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { Comment } from '../models';

/** [BONUS #4] Bình luận trong card. */
@Injectable({ providedIn: 'root' })
export class CommentService {
  private readonly api = inject(ApiService); // TODO: gọi backend qua this.api (get/post/patch/delete)

  readonly comments = signal<Comment[]>([]); // của card đang mở

  // TODO: lấy bình luận của card (join user để hiện tên/avatar).
  async loadComments(cardId: string): Promise<void> {}

  // TODO: thêm bình luận.
  async addComment(cardId: string, content: string): Promise<void> {}

  // TODO: xoá bình luận (chỉ tác giả).
  async deleteComment(id: string): Promise<void> {}
}
