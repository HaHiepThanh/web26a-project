import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { User } from '../../../models';
import { ChatService, CURRENT_CHAT_USER_ID } from '../../../services/chat.service';
import { BoardService } from '../../../services/board.service';
import { CardService } from '../../../services/card.service';
import { ListService } from '../../../services/list.service';
import { ActivityService } from '../../../services/activity.service';
import { MessageList } from '../message-list/message-list';
import { ChatInput } from '../chat-input/chat-input';

/** Bề rộng min/mặc định/thu gọn của khung chat (px) + trần theo % viewport (#resize). */
const MIN_WIDTH = 260;
const DEFAULT_WIDTH = 320;
const COLLAPSED_WIDTH = 56;
const MAX_WIDTH_RATIO = 0.45;
const WIDTH_STORAGE_KEY = 'trello_chat_width';
const COLLAPSED_STORAGE_KEY = 'trello_chat_collapsed';

/**
 * Khung chat dạng dock bên trái board (#8), ẩn/hiện qua nút "Chat" ở topbar
 * (board.html giữ template ref #chatPanel để gọi toggleOpen()/đọc isOpen()).
 * Đóng chat vẫn biết có tin mới qua badge + nút rung (pulse) + toast preview
 * góc dưới-phải + đổi tiêu đề tab.
 *
 * Kéo-thả đổi bề rộng + thu gọn thành dải mỏng (#resize) — 2 trạng thái tách
 * biệt: `isOpen` (nút "Chat" ở topbar ẩn/hiện HẲN khung) và `collapsed` (nút
 * riêng trên khung, khung vẫn còn đó nhưng co lại còn 1 dải icon mỏng).
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

  // ---- Resize + thu gọn (#resize) ----
  readonly minWidth = MIN_WIDTH;
  readonly collapsedWidth = COLLAPSED_WIDTH;
  readonly width = signal(DEFAULT_WIDTH);
  readonly collapsed = signal(false);
  readonly isResizing = signal(false);
  private resizeRafId: number | null = null;

  /** Public — template dùng cho aria-valuemax của tay cầm resize. */
  maxWidth(): number {
    return Math.round(window.innerWidth * MAX_WIDTH_RATIO);
  }

  private clampWidth(w: number): number {
    return Math.min(Math.max(w, MIN_WIDTH), this.maxWidth());
  }

  private loadResizeState(): void {
    try {
      const rawWidth = localStorage.getItem(WIDTH_STORAGE_KEY);
      if (rawWidth) this.width.set(this.clampWidth(Number(rawWidth) || DEFAULT_WIDTH));
    } catch {
      this.width.set(DEFAULT_WIDTH);
    }
    try {
      this.collapsed.set(localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1');
    } catch {
      this.collapsed.set(false);
    }
  }

  /** Bắt đầu kéo tay cầm ở rìa phải khung — dùng rAF để gộp nhiều pointermove
   *  thành 1 lần ghi width/frame (mượt, không giật/chớp khi kéo nhanh). */
  startResize(event: PointerEvent): void {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = this.width();
    this.isResizing.set(true);

    const onMove = (e: PointerEvent): void => {
      const next = this.clampWidth(startWidth + (e.clientX - startX));
      if (this.resizeRafId !== null) return;
      this.resizeRafId = requestAnimationFrame(() => {
        this.width.set(next);
        this.resizeRafId = null;
      });
    };

    const onUp = (): void => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      this.isResizing.set(false);
      try {
        localStorage.setItem(WIDTH_STORAGE_KEY, String(this.width()));
      } catch {
        /* localStorage không khả dụng — bỏ qua, chỉ mất tính năng nhớ bề rộng */
      }
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp, { once: true });
  }

  /** Bàn phím thay chuột trên tay cầm resize (ARIA "separator" pattern, #accessibility). */
  onHandleKeydown(event: KeyboardEvent): void {
    const STEP = 16;
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = this.width() - STEP;
    else if (event.key === 'ArrowRight') next = this.width() + STEP;
    else if (event.key === 'Home') next = MIN_WIDTH;
    else if (event.key === 'End') next = this.maxWidth();
    if (next === null) return;
    event.preventDefault();
    this.width.set(this.clampWidth(next));
    try {
      localStorage.setItem(WIDTH_STORAGE_KEY, String(this.width()));
    } catch {
      /* bỏ qua */
    }
  }

  toggleCollapsed(): void {
    this.collapsed.update((v) => !v);
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, this.collapsed() ? '1' : '0');
    } catch {
      /* bỏ qua */
    }
  }

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
    this.loadResizeState();

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
