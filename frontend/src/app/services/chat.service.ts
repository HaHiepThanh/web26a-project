import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { Message } from '../models';

/**
 * [AI-CHAT] Khung chat theo board: gửi/nhận tin nhắn + subscribe realtime.
 * Lưu ý: cần bảng `messages` ở DB (xem message.model.ts).
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly api = inject(ApiService); // TODO: gọi backend qua this.api (get/post/patch/delete)

  readonly messages = signal<Message[]>([]); // tin nhắn của board đang mở

  // TODO: lấy lịch sử tin nhắn của board (join user), sort cũ -> mới.
  async loadMessages(boardId: string): Promise<void> {}

  // TODO: gửi tin nhắn mới vào board.
  async sendMessage(boardId: string, content: string): Promise<void> {}

  // TODO: subscribe realtime bảng messages theo boardId để nhận tin của người khác.
  //       Trả về hàm cleanup khi rời board (giống RealtimeService).
  subscribeToBoard(boardId: string): () => void {
    return () => {};
  }
}
