import { AfterViewChecked, Component, ElementRef, input, output, viewChild } from '@angular/core';
import { Message, TaskSuggestion, User } from '../../../models';
import { MessageItem } from '../message-item/message-item';
import { TaskSuggestionCard } from '../task-suggestion-card/task-suggestion-card';

/** Danh sách tin nhắn + thẻ gợi ý AI (nếu có), tự cuộn xuống cuối khi có tin mới (#8). */
@Component({
  selector: 'app-message-list',
  imports: [MessageItem, TaskSuggestionCard],
  templateUrl: './message-list.html',
  styleUrl: './message-list.css',
})
export class MessageList implements AfterViewChecked {
  readonly messages = input<Message[]>([]);
  readonly usersById = input<Record<string, User | undefined>>({});
  readonly currentUserId = input('');
  readonly memberNames = input<string[]>([]);
  readonly pendingSuggestion = input<TaskSuggestion | null>(null);
  readonly pendingAssigneeName = input<string | null>(null);

  readonly confirmSuggestion = output<void>();
  readonly dismissSuggestion = output<void>();

  private readonly scrollEl = viewChild<ElementRef<HTMLElement>>('scrollArea');
  private lastMessageCount = 0;

  trackByMessageId(_: number, m: Message): string {
    return m.id;
  }

  ngAfterViewChecked(): void {
    const count = this.messages().length;
    if (count !== this.lastMessageCount) {
      this.lastMessageCount = count;
      const el = this.scrollEl()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }
}
