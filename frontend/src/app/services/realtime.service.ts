import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';

/**
 * [BONUS #5] Realtime collaboration qua Supabase Realtime.
 * Subscribe theo thay đổi bảng lists/cards của board đang mở, rồi cập nhật signal
 * trong ListService/CardService để những người khác thấy gần như tức thì.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly api = inject(ApiService); // TODO: gọi backend qua this.api (get/post/patch/delete)

  // TODO: subscribe channel theo boardId (postgres_changes trên lists & cards).
  //       Trả về hàm cleanup để component gọi khi rời board.
  subscribeToBoard(boardId: string): () => void {
    // TODO
    return () => {};
  }

  // TODO (bonus): presence — hiển thị ai đang mở board này.
}
