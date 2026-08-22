import { Injectable, inject, signal } from '@angular/core';
import {
  ApiMessage,
  Message,
  PendingSuggestion,
  TaskSuggestion,
  User,
} from '../models';
import { AiService } from './ai.service';

import { ApiService } from './api.service';
import { describeError } from './api-error.util';
let idSeq = 1;
function mockId(prefix: string): string {
  return `${prefix}-${Date.now()}-${idSeq++}`;
}

/** "Bạn" trong khung chat demo — trùng 1 thành viên mock của board.service.ts. */
export const CURRENT_CHAT_USER_ID = 'u-nam';

/** Vài cặp tin nhắn mẫu khác nhau theo board (#chat-hub) — để Dashboard Chat không
 *  hiện y hệt 1 dòng preview cho mọi board; board không khớp id nào rơi về cặp mặc định. */
const MESSAGE_SETS: Record<string, { userId: string; content: string; minutesAgo: number }[]> = {
  // -- Dữ liệu mẫu đã comment để test từ tài khoản trắng hoàn toàn — bỏ comment để khôi phục --
  // 'b-1': [
  //   { userId: 'u-linh', content: 'Mọi người check lại API xác thực trước chiều nay giúp mình nhé', minutesAgo: 40 },
  //   { userId: 'u-khoa', content: '@Nam làm giúp mình phần fix bug thanh toán trước thứ 6 nhé, gấp lắm', minutesAgo: 35 },
  // ],
  // 'b-2': [
  //   { userId: 'u-my', content: 'Mình vừa đẩy xong bản UI tìm trọ mới, mọi người xem giúp', minutesAgo: 12 },
  //   { userId: 'u-nam', content: 'Ok để mình review trong hôm nay', minutesAgo: 10 },
  // ],
  // 'b-3': [{ userId: 'u-bao', content: 'Tuần này còn 2 task deadline thứ 6, ai rảnh nhận giúp mình với', minutesAgo: 1440 }],
  // 'b-4': [
  //   { userId: 'u-khoa', content: 'Demo MVP cho nhà đầu tư dời sang 10h sáng mai nhé cả nhà', minutesAgo: 5 },
  //   { userId: 'u-linh', content: 'Rõ, mình chuẩn bị lại slide', minutesAgo: 3 },
  // ],
};

const DEFAULT_MESSAGE_SET = MESSAGE_SETS['b-1'] ?? [];

function mockMessages(boardId: string): Message[] {
  const now = Date.now();
  const set = MESSAGE_SETS[boardId] ?? DEFAULT_MESSAGE_SET;
  return set.map((m) => ({
    id: mockId('msg'),
    orgId: 'org-demo',
    boardId,
    userId: m.userId,
    content: m.content,
    createdAt: new Date(now - 1000 * 60 * m.minutesAgo).toISOString(),
  }));
}

function lastSeenKey(boardId: string): string {
  return `trello_chat_lastseen_${boardId}`;
}

/** [AI-CHAT] Khung chat nổi theo board (#8): gửi/nhận tin nhắn + phát hiện task qua AiService. */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly ai = inject(AiService);
  private readonly api = inject(ApiService);

  readonly messages = signal<Message[]>([]);
  readonly loadError = signal<string | null>(null);
  readonly pendingSuggestion = signal<PendingSuggestion | null>(null);

  private loadedBoardId: string | null = null;

  async loadMessages(boardId: string, force = false): Promise<void> {
    if (!boardId) {
      this.messages.set([]);
      return;
    }
    if (!force && this.loadedBoardId === boardId) return;
    this.loadedBoardId = boardId;
    try {
      const rows = await this.api.get<ApiMessage[]>(`/chat?boardId=${boardId}`);
      // Backend trả kèm khối `user` (đã join sang bảng users) nhưng model
      // `Message` chỉ giữ userId — tên hiển thị lấy từ roster thành viên khi vẽ.
      this.messages.set(
        rows.map((r) => ({
          id: r.id,
          orgId: '',
          boardId,
          userId: r.userId,
          content: r.content,
          createdAt: r.createdAt,
        })) as Message[],
      );
    } catch (e) {
      this.messages.set([]);
      this.loadError.set(describeError(e, 'Không tải được tin nhắn.'));
    }
  }

  /** Gửi tin nhắn của "Bạn" (CURRENT_CHAT_USER_ID) rồi chạy AI phát hiện task (#8). */
  async sendMessage(boardId: string, content: string, members: User[]): Promise<void> {
    const trimmed = content.trim();
    if (!trimmed) return;

    let message: Message;
    try {
      const row = await this.api.post<{ id: string; boardId: string; userId: string; content: string; createdAt: string }>(
        '/chat',
        { boardId, content: trimmed },
      );
      message = {
        id: row.id,
        orgId: '',
        boardId: row.boardId,
        userId: row.userId,
        content: row.content,
        createdAt: row.createdAt,
      };
    } catch (e) {
      this.loadError.set(describeError(e, 'Không gửi được tin nhắn.'));
      return;
    }
    this.messages.update((all) => [...all, message]);

    const result = await this.ai.detectTask({
      boardId,
      content: trimmed,
      members: members.map((m) => ({ id: m.id, displayName: m.displayName ?? m.email })),
    });

    if (result.isTask && result.suggestion) {
      this.pendingSuggestion.set({ id: mockId('sugg'), sourceMessageId: message.id, suggestion: result.suggestion });
    }
  }

  dismissSuggestion(): void {
    this.pendingSuggestion.set(null);
  }

  /** Gửi tin nhắn giả lập từ người khác — dùng để demo badge/pulse/toast khi đóng chat. */
  simulateIncomingMessage(boardId: string, userId: string, content: string): void {
    const message: Message = {
      id: mockId('msg'),
      orgId: 'org-demo',
      boardId,
      userId,
      content,
      createdAt: new Date().toISOString(),
    };
    this.messages.update((all) => [...all, message]);
  }

  subscribeToBoard(boardId: string): () => void {
    return () => {};
  }

  // ---- Dashboard Chat hub (#chat-hub): xem trước 1 board mà KHÔNG đụng tới
  // `messages`/`loadedBoardId` (state của khung chat board đang mở) ----

  /** Tin cuối + số tin chưa đọc của 1 board, dựa trên mốc "đã xem tới đâu" lưu localStorage.
   *  Tái dùng đúng mockMessages() dùng cho loadMessages(), không tạo nguồn dữ liệu thứ 2. */
  getConversationPreview(boardId: string): { lastMessage: Message | null; unreadCount: number } {
    const msgs = mockMessages(boardId);
    const lastMessage = msgs[msgs.length - 1] ?? null;
    const lastSeen = this.lastSeenFor(boardId);
    const unreadCount = msgs.filter((m) => m.userId !== CURRENT_CHAT_USER_ID && Date.parse(m.createdAt) > lastSeen).length;
    return { lastMessage, unreadCount };
  }

  private lastSeenFor(boardId: string): number {
    try {
      const raw = localStorage.getItem(lastSeenKey(boardId));
      return raw ? Number(raw) || 0 : 0;
    } catch {
      return 0;
    }
  }

  /** Gọi khi người dùng thực sự đã mở/xem chat của 1 board — board đó hết "chưa đọc". */
  markSeen(boardId: string): void {
    try {
      localStorage.setItem(lastSeenKey(boardId), String(Date.now()));
    } catch {
      /* bỏ qua */
    }
  }
}

// Kiểu đã chuyển sang models/ — re-export để chỗ nào còn import từ đây vẫn chạy.
export type { PendingSuggestion };
