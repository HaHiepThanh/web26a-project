import { Signal, computed, signal } from '@angular/core';
import { Message, User } from '../../models';

/** Chỉ những gì phần soạn tin cần ở ChatStore — khai hẹp để test được bằng đồ giả. */
export interface KhoChat {
  sendMessage(boardId: string, content: string, members: User[], replyToId?: string): Promise<void>;
  editMessage(id: string, content: string): Promise<void>;
  recallMessage(id: string): Promise<void>;
  loadOlder(boardId: string): Promise<boolean>;
  hasMore: Signal<Record<string, boolean>>;
}

/**
 * Trạng thái "đang trả lời / đang sửa" của một khung chat.
 *
 * Tách khỏi component vì có ĐÚNG HAI khung chat dùng nó — `chat-panel` (trong
 * board) và `dashboard-chat-thread`. Chép tay hai bản là đúng cái bẫy đã gặp
 * nhiều lần trong dự án này: sửa một nơi, quên nơi kia, và lỗi chỉ lộ ra ở một
 * trong hai màn hình.
 */
export class SoanTin {
  /** Hai trạng thái LOẠI TRỪ NHAU — không bao giờ vừa trả lời vừa sửa. */
  readonly replyingTo = signal<Message | null>(null);
  readonly editing = signal<Message | null>(null);

  readonly hasMore = computed(() => !!this.kho.hasMore()[this.boardId()]);

  constructor(
    private readonly kho: KhoChat,
    private readonly boardId: () => string,
    private readonly members: () => User[],
  ) {}

  /** Truyền thẳng vào `message-list` — nó cần biết KẾT QUẢ để lần ngược tìm tin. */
  readonly taiThem = (): Promise<boolean> => this.kho.loadOlder(this.boardId());

  batDauTraLoi(m: Message): void {
    this.editing.set(null);
    this.replyingTo.set(m);
  }

  batDauSua(m: Message): void {
    this.replyingTo.set(null);
    this.editing.set(m);
  }

  huy(): void {
    this.replyingTo.set(null);
    this.editing.set(null);
  }

  async gui(e: { text: string; replyToId?: string }): Promise<void> {
    await this.kho.sendMessage(this.boardId(), e.text, this.members(), e.replyToId);
    this.huy();
  }

  async luuSua(e: { id: string; text: string }): Promise<void> {
    await this.kho.editMessage(e.id, e.text);
    this.huy();
  }

  async thuHoi(m: Message): Promise<void> {
    await this.kho.recallMessage(m.id);
    // Đang sửa đúng tin vừa thu hồi thì phải thoát, nếu không ô soạn treo nội
    // dung của một tin không còn tồn tại.
    if (this.editing()?.id === m.id || this.replyingTo()?.id === m.id) this.huy();
  }
}
