import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { User } from '../../../models';
import { ChatService, CURRENT_CHAT_USER_ID } from '../../../services/chat.service';
import { BoardService } from '../../../services/board.service';
import { CardService } from '../../../services/card.service';
import { ListService } from '../../../services/list.service';
import { ActivityService } from '../../../services/activity.service';
import { MessageList } from '../message-list/message-list';
import { ChatInput } from '../chat-input/chat-input';

/**
 * Khung chat nổi (#8, phương án B đã chốt — bong bóng góc dưới-phải, không phải
 * panel cố định bên cạnh). Đóng chat vẫn biết có tin mới qua badge + icon rung +
 * toast preview (cùng góc) + đổi tiêu đề tab.
 */
@Component({
  selector: 'app-chat-panel',
  imports: [MessageList, ChatInput],
  templateUrl: './chat-panel.html',
  styleUrl: './chat-panel.css',
})
export class ChatPanel {
  private readonly chat = inject(ChatService);
  private readonly boardService = inject(BoardService);
  private readonly cardService = inject(CardService);
  private readonly listService = inject(ListService);
  private readonly activityService = inject(ActivityService);

  readonly boardId = input.required<string>();
  readonly taskCreated = output<string>();

  readonly isOpen = signal(false);
  readonly unreadCount = signal(0);
  readonly pulse = signal(false);
  readonly toastMessage = signal<{ name: string; text: string } | null>(null);

  readonly messages = this.chat.messages;
  readonly members = this.boardService.members;
  readonly currentUserId = CURRENT_CHAT_USER_ID;

  readonly usersById = computed(() => {
    const map: Record<string, User | undefined> = {};
    for (const m of this.members()) map[m.id] = m;
    return map;
  });
  readonly memberNames = computed(() => this.members().map((m) => m.displayName ?? m.email));

  readonly pendingSuggestion = computed(() => this.chat.pendingSuggestion()?.suggestion ?? null);
  readonly pendingAssigneeName = computed(() => {
    const s = this.chat.pendingSuggestion()?.suggestion;
    if (!s?.assigneeId) return null;
    const u = this.usersById()[s.assigneeId];
    return u?.displayName ?? u?.email ?? null;
  });

  private readonly originalTitle = document.title;
  private lastSeenCount = 0;

  constructor() {
    // effect() (không phải constructor body trực tiếp) vì input.required() chỉ có
    // giá trị SAU khi Angular gán input, không đọc được ngay trong constructor.
    effect(() => {
      void this.chat.loadMessages(this.boardId());
    });

    effect(() => {
      const list = this.messages();
      if (list.length <= this.lastSeenCount) {
        this.lastSeenCount = list.length;
        return;
      }
      const newOnes = list.slice(this.lastSeenCount);
      this.lastSeenCount = list.length;
      const fromOthers = newOnes.filter((m) => m.userId !== CURRENT_CHAT_USER_ID);
      if (!fromOthers.length || this.isOpen()) return;

      this.unreadCount.update((n) => n + fromOthers.length);
      this.updateTitle();
      this.pulse.set(false);
      setTimeout(() => this.pulse.set(true));

      const last = fromOthers[fromOthers.length - 1];
      const sender = this.usersById()[last.userId];
      this.toastMessage.set({ name: sender?.displayName ?? sender?.email ?? 'Ai đó', text: last.content });
      setTimeout(() => this.toastMessage.set(null), 3200);
    });
  }

  private updateTitle(): void {
    const n = this.unreadCount();
    document.title = n > 0 ? `(${n}) ${this.originalTitle}` : this.originalTitle;
  }

  toggleOpen(): void {
    this.isOpen.update((v) => !v);
    if (this.isOpen()) {
      this.unreadCount.set(0);
      this.toastMessage.set(null);
      this.updateTitle();
    }
  }

  openFromToast(): void {
    this.toastMessage.set(null);
    if (!this.isOpen()) this.toggleOpen();
  }

  async onSend(content: string): Promise<void> {
    await this.chat.sendMessage(this.boardId(), content, this.members());
  }

  async confirmSuggestion(): Promise<void> {
    const pending = this.chat.pendingSuggestion();
    if (!pending) return;
    const targetList = [...this.listService.lists()].sort((a, b) => a.position - b.position)[0];
    if (!targetList) return;
    const card = await this.cardService.createCard(targetList.id, {
      title: pending.suggestion.title,
      priority: 'trung',
      assigneeId: pending.suggestion.assigneeId,
      dueDate: pending.suggestion.dueDate,
    });
    this.chat.dismissSuggestion();
    if (card) {
      this.activityService.record(this.boardId(), card.id, 'đã tạo thẻ này từ gợi ý AI trong chat');
      this.taskCreated.emit(card.title);
    }
  }

  dismissSuggestion(): void {
    this.chat.dismissSuggestion();
  }

  /** Nút demo — giả lập tin nhắn từ người khác để xem badge/pulse/toast/title khi đóng chat. */
  simulateIncoming(): void {
    const others = this.members().filter((m) => m.id !== CURRENT_CHAT_USER_ID);
    const from = others[Math.floor(Math.random() * others.length)] ?? this.members()[0];
    if (!from) return;
    const samples = ['Bug ở form đăng ký nghiêm trọng nè mọi người ơi', '@Nam xem giúp mình PR #482 với', 'Ai rảnh review code giúp mình không?'];
    this.chat.simulateIncomingMessage(this.boardId(), from.id, samples[Math.floor(Math.random() * samples.length)]);
  }
}
