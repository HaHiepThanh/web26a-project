import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';
import { ChatTaskSuggestion, Message, User } from '../../../models';
import { MessageItem } from '../message-item/message-item';
import { TaskSuggestionCard } from '../task-suggestion-card/task-suggestion-card';

/** Danh sách tin nhắn + chip gợi ý AI gắn ngay dưới tin nhắn sinh ra nó. */
@Component({
  selector: 'app-message-list',
  imports: [MessageItem, TaskSuggestionCard],
  templateUrl: './message-list.html',
  styleUrl: './message-list.css',
})
export class MessageList {
  readonly messages = input<Message[]>([]);
  readonly usersById = input<Record<string, User | undefined>>({});
  readonly currentUserId = input<string>('');
  readonly memberNames = input<string[]>([]);
  readonly members = input<User[]>([]);

  /**
   * Gợi ý tra theo `messageId`.
   *
   * Vẽ chip ngay dưới ĐÚNG tin nhắn sinh ra nó, thay vì ghim một cái ở cuối danh
   * sách như bản trước — người đọc phải biết gợi ý đến từ câu nào, nhất là khi
   * chat đang trôi nhanh.
   */
  readonly suggestionsByMessageId = input<Record<string, ChatTaskSuggestion | undefined>>({});

  readonly openSuggestion = output<ChatTaskSuggestion>();
  readonly dismissSuggestion = output<ChatTaskSuggestion>();

  private readonly scrollArea = viewChild<ElementRef<HTMLDivElement>>('scrollArea');

  constructor() {
    // Có tin mới (hoặc gợi ý mới) thì cuộn xuống đáy.
    effect(() => {
      this.messages();
      this.suggestionsByMessageId();
      queueMicrotask(() => {
        const el = this.scrollArea()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }

  trackByMessageId(_: number, m: Message): string {
    return m.id;
  }
}
