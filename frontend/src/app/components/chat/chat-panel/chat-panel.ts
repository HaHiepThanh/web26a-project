import { Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { ChatTaskSuggestion, User } from '../../../models';
import { ChatService } from '../../../services/chat.service';
import { TaskSuggestionService } from '../../../services/task-suggestion.service';
import { BoardService } from '../../../services/board.service';
import { CardStore } from '../../../ngrx/card/card.store';
import { ListService } from '../../../services/list.service';
import { MessageList } from '../message-list/message-list';
import { ChatInput } from '../chat-input/chat-input';

const MIN_WIDTH = 260;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 300;
const COLLAPSED_WIDTH = 44;
const WIDTH_KEY = 'trello_chat_panel_width';
const COLLAPSED_KEY = 'trello_chat_panel_collapsed';
const RESIZE_STEP = 16;

/**
 * Khung chat dạng panel cố định bên trái trang Board (thay cho bong bóng nổi góc
 * dưới-phải trước đây), kéo được để đổi bề rộng, thu gọn được để trả lại chỗ cho
 * Board. Thu gọn vẫn biết có tin mới qua badge + icon rung + toast preview + đổi
 * tiêu đề tab — chỉ đổi CÁCH TRÌNH BÀY, toàn bộ logic chat dùng lại ChatService.
 */
@Component({
  selector: 'app-chat-panel',
  imports: [MessageList, ChatInput],
  templateUrl: './chat-panel.html',
  styleUrl: './chat-panel.css',
  host: {
    class: 'flex h-full shrink-0',
    '[style.width.px]': 'panelWidth()',
  },
})
export class ChatPanel {
  private readonly chat = inject(ChatService);
  private readonly suggestions = inject(TaskSuggestionService);
  private readonly boardService = inject(BoardService);
  private readonly cardService = inject(CardStore);
  private readonly listService = inject(ListService);

  readonly boardId = input.required<string>();
  readonly taskCreated = output<string>();

  readonly collapsedWidth = COLLAPSED_WIDTH;
  readonly minWidth = MIN_WIDTH;
  readonly maxWidth = MAX_WIDTH;

  readonly collapsed = signal(this.loadCollapsed());
  readonly width = signal(this.loadWidth());
  readonly panelWidth = computed(() => (this.collapsed() ? COLLAPSED_WIDTH : this.width()));
  readonly resizing = signal(false);

  readonly unreadCount = signal(0);
  readonly pulse = signal(false);
  readonly toastMessage = signal<{ name: string; text: string } | null>(null);

  readonly messages = this.chat.messages;
  readonly members = this.boardService.members;
  /** uid thật của người đang đăng nhập — tin của mình mới căn phải. */
  readonly currentUserId = this.chat.currentUserId;

  readonly usersById = computed(() => {
    const map: Record<string, User | undefined> = {};
    for (const m of this.members()) map[m.id] = m;
    return map;
  });
  readonly memberNames = computed(() => this.members().map((m) => m.displayName ?? m.email));

  /** Gợi ý tra theo messageId — chip vẽ ngay dưới đúng tin nhắn sinh ra nó. */
  readonly suggestionsByMessageId = this.suggestions.byMessageId;

  // Bóc tiền tố "(số) " nếu tab title đang còn sót từ lần vào board trước — nếu không
  // sẽ chồng thành "(2) (2) ..." mỗi lần vào lại board (ChatPanel tạo mới mỗi lần).
  private readonly originalTitle = document.title.replace(/^\(\d+\)\s*/, '');
  private lastSeenCount = 0;

  constructor() {
    // Rời board (ChatPanel bị huỷ) → trả tab title về sạch, không để badge "(n)" dính lại.
    inject(DestroyRef).onDestroy(() => {
      document.title = this.originalTitle;
    });

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
      const fromOthers = newOnes.filter((m) => m.userId !== this.currentUserId());
      if (!fromOthers.length || !this.collapsed()) return;

      this.unreadCount.update((n) => n + fromOthers.length);
      this.updateTitle();
      this.pulse.set(false);
      setTimeout(() => this.pulse.set(true));

      const last = fromOthers[fromOthers.length - 1];
      const sender = this.usersById()[last.userId];
      this.toastMessage.set({ name: sender?.displayName ?? sender?.email ?? 'Someone', text: last.content });
      setTimeout(() => this.toastMessage.set(null), 3200);
    });
  }

  private updateTitle(): void {
    const n = this.unreadCount();
    document.title = n > 0 ? `(${n}) ${this.originalTitle}` : this.originalTitle;
  }

  private loadWidth(): number {
    const raw = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(raw) && raw > 0 ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, raw)) : DEFAULT_WIDTH;
  }

  private loadCollapsed(): boolean {
    const saved = localStorage.getItem(COLLAPSED_KEY);
    if (saved !== null) return saved === '1';
    // Chưa có lựa chọn lưu trước đó: trên màn hình hẹp, mặc định thu gọn để chừa
    // chỗ cho board thay vì chat (300px mặc định) chiếm gần hết viewport mobile.
    return window.innerWidth < 768;
  }

  toggleCollapsed(): void {
    this.collapsed.update((v) => !v);
    localStorage.setItem(COLLAPSED_KEY, this.collapsed() ? '1' : '0');
    if (!this.collapsed()) {
      this.unreadCount.set(0);
      this.toastMessage.set(null);
      this.updateTitle();
    }
  }

  openFromToast(): void {
    this.toastMessage.set(null);
    if (this.collapsed()) this.toggleCollapsed();
  }

  /** Kéo cạnh phải panel để đổi bề rộng — chỉ đọc clientX, không dùng CDK Drag (không
   *  cần cdkDropList/DragDrop ở đây, đây là resize UI thuần, khác hẳn CDK card/list DnD). */
  onResizeStart(event: PointerEvent): void {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = this.width();
    this.resizing.set(true);

    const onMove = (e: PointerEvent) => {
      const next = startWidth + (e.clientX - startX);
      this.width.set(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)));
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      this.resizing.set(false);
      localStorage.setItem(WIDTH_KEY, String(this.width()));
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  onResizeKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? RESIZE_STEP : -RESIZE_STEP;
    this.width.update((w) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w + delta)));
    localStorage.setItem(WIDTH_KEY, String(this.width()));
  }

  async onSend(content: string): Promise<void> {
    await this.chat.sendMessage(this.boardId(), content, this.members());
  }

  openSuggestion(s: ChatTaskSuggestion): void {
    this.suggestions.open(s);
  }

  dismissSuggestion(s: ChatTaskSuggestion): void {
    void this.suggestions.dismiss(s);
  }
}
