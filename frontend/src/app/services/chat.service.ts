import { Injectable, inject, signal } from '@angular/core';
import { Message, TaskSuggestion, User } from '../models';
import { AiService } from './ai.service';

let idSeq = 1;
function mockId(prefix: string): string {
  return `${prefix}-${Date.now()}-${idSeq++}`;
}

/** "Bạn" trong khung chat demo — trùng 1 thành viên mock của board.service.ts. */
export const CURRENT_CHAT_USER_ID = 'u-nam';

function mockMessages(boardId: string): Message[] {
  const now = Date.now();
  return [
    {
      id: mockId('msg'),
      tenantId: 'tenant-demo',
      boardId,
      userId: 'u-linh',
      content: 'Mọi người check lại API xác thực trước chiều nay giúp mình nhé',
      createdAt: new Date(now - 1000 * 60 * 40).toISOString(),
    },
    {
      id: mockId('msg'),
      tenantId: 'tenant-demo',
      boardId,
      userId: 'u-khoa',
      content: '@Nam làm giúp mình phần fix bug thanh toán trước thứ 6 nhé, gấp lắm',
      createdAt: new Date(now - 1000 * 60 * 35).toISOString(),
    },
  ];
}

export interface PendingSuggestion {
  id: string;
  sourceMessageId: string;
  suggestion: TaskSuggestion;
}

/** [AI-CHAT] Khung chat nổi theo board (#8): gửi/nhận tin nhắn + phát hiện task qua AiService. */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly ai = inject(AiService);

  readonly messages = signal<Message[]>([]);
  readonly pendingSuggestion = signal<PendingSuggestion | null>(null);

  private loadedBoardId: string | null = null;

  async loadMessages(boardId: string): Promise<void> {
    if (this.loadedBoardId === boardId) return;
    this.loadedBoardId = boardId;
    this.messages.set(mockMessages(boardId));
  }

  /** Gửi tin nhắn của "Bạn" (CURRENT_CHAT_USER_ID) rồi chạy AI phát hiện task (#8). */
  async sendMessage(boardId: string, content: string, members: User[]): Promise<void> {
    const trimmed = content.trim();
    if (!trimmed) return;

    const message: Message = {
      id: mockId('msg'),
      tenantId: 'tenant-demo',
      boardId,
      userId: CURRENT_CHAT_USER_ID,
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
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
      tenantId: 'tenant-demo',
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
}
