import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { User } from '../../../models';
import { ChatService, CURRENT_CHAT_USER_ID } from '../../../services/chat.service';
import { BoardService } from '../../../services/board.service';
import { CardService } from '../../../services/card.service';
import { ListService } from '../../../services/list.service';
import { ActivityService } from '../../../services/activity.service';
import { createResizablePanel } from '../../../services/resizable-panel.util';
import { MessageList } from '../message-list/message-list';
import { ChatInput } from '../chat-input/chat-input';

/** Bề rộng min/mặc định/thu gọn của khung chat (px) + trần theo % viewport (#resize). */
const MIN_WIDTH = 260;
const DEFAULT_WIDTH = 320;
const COLLAPSED_WIDTH = 56;
const MAX_WIDTH_RATIO = 0.45;
const WIDTH_STORAGE_KEY = 'trello_chat_width';
const COLLAPSED_STORAGE_KEY = 'trello_chat_collapsed';
const OPEN_STORAGE_KEY = 'trello_chat_open';

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

  readonly unreadCount = signal(0);
  readonly pulse = signal(false);
  readonly toastMessage = signal<{ name: string; text: string } | null>(null);

  // ---- Resize + thu gọn (#resize) — logic dùng chung, xem resizable-panel.util.ts ----
  private readonly panel = createResizablePanel({
    defaultWidth: DEFAULT_WIDTH,
    minWidth: MIN_WIDTH,
    collapsedWidth: COLLAPSED_WIDTH,
    maxWidthRatio: MAX_WIDTH_RATIO,
    widthStorageKey: WIDTH_STORAGE_KEY,
    collapsedStorageKey: COLLAPSED_STORAGE_KEY,
  });
  readonly minWidth = this.panel.minWidth;
  readonly collapsedWidth = this.panel.collapsedWidth;
  readonly width = this.panel.width;
  readonly collapsed = this.panel.collapsed;
  readonly isResizing = this.panel.isResizing;
  maxWidth = (): number => this.panel.maxWidth();
  startResize = (event: PointerEvent): void => this.panel.startResize(event);
  onHandleKeydown = (event: KeyboardEvent): void => this.panel.onHandleKeydown(event);
  toggleCollapsed = (): void => this.panel.toggleCollapsed();

  // ---- Mở/đóng khung (#8) — nhớ theo localStorage, mặc định MỞ (#3) ----
  readonly isOpen = signal(true);

  private loadOpenState(): void {
    try {
      const raw = localStorage.getItem(OPEN_STORAGE_KEY);
      this.isOpen.set(raw === null ? true : raw === '1');
    } catch {
      this.isOpen.set(true);
    }
  }

  private persistOpenState(): void {
    try {
      localStorage.setItem(OPEN_STORAGE_KEY, this.isOpen() ? '1' : '0');
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
    this.loadOpenState();

    // effect() (không phải constructor body trực tiếp) vì input.required() chỉ có
    // giá trị SAU khi Angular gán input, không đọc được ngay trong constructor.
    effect(() => {
      void this.chat.loadMessages(this.boardId());
    });

    // Board đang mở chat = coi như đã xem tới hiện tại (#chat-hub) — chạy lại mỗi
    // khi boardId hoặc isOpen đổi, kể cả lần mở mặc định đầu tiên (không qua toggleOpen()).
    effect(() => {
      if (this.isOpen()) this.chat.markSeen(this.boardId());
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
    this.persistOpenState();
    if (this.isOpen()) this.markOpened();
  }

  /** Mở khung nếu đang đóng — idempotent, dùng khi board.ts ép mở qua ?chat=1 (#2)
   *  mà không đảo ngược trạng thái đang mở sẵn như toggleOpen() sẽ làm. */
  open(): void {
    if (this.isOpen()) return;
    this.isOpen.set(true);
    this.persistOpenState();
    this.markOpened();
  }

  private markOpened(): void {
    this.unreadCount.set(0);
    this.toastMessage.set(null);
    this.updateTitle();
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
