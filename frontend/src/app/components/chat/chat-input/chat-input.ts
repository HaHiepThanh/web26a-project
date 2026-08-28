import { Component, ElementRef, computed, effect, input, output, signal, viewChild } from '@angular/core';
import { Message, User } from '../../../models';

/** Ô soạn tin cao tối đa ngần này rồi mới cuộn — khớp `max-height` trong chat-input.css. */
const MAX_COMPOSER_HEIGHT = 140;

/** Ô nhập chat: gõ "@" để autocomplete tên thành viên board (#8), Enter để gửi. */
@Component({
  selector: 'app-chat-input',
  imports: [],
  templateUrl: './chat-input.html',
  styleUrl: './chat-input.css',
})
export class ChatInput {
  readonly members = input<User[]>([]);
  /** Tin đang được trả lời — hiện dải nhắc phía trên ô soạn. */
  readonly replyingTo = input<Message | null>(null);
  /** Tin đang được sửa. Loại trừ nhau với `replyingTo`. */
  readonly editing = input<Message | null>(null);
  readonly currentUserId = input<string>('');

  /**
   * Đổi từ `output<string>` sang kiểu có `replyToId`.
   *
   * TypeScript sẽ báo đỏ ở CẢ HAI chỗ dùng (`chat-panel` và
   * `dashboard-chat-thread`) — đúng như mong muốn: sửa một nơi quên nơi kia là
   * lỗi im lặng chỉ lộ ra ở một trong hai khung chat.
   */
  readonly send = output<{ text: string; replyToId?: string }>();
  readonly saveEdit = output<{ id: string; text: string }>();
  /** Bỏ dải nhắc (nút ✕ hoặc phím Esc). */
  readonly cancelContext = output<void>();

  readonly value = signal('');
  private readonly mentionQuery = signal<string | null>(null);
  /** Angular's [value] binding doesn't reliably re-apply to <textarea> after the
   *  first render (unlike <input>) — mọi chỗ set `value` bằng code (không phải do
   *  người dùng gõ) phải tự đồng bộ lại DOM .value qua ref này. */
  private readonly textareaRef = viewChild<ElementRef<HTMLTextAreaElement>>('msgInput');

  private syncTextarea(text: string): void {
    const el = this.textareaRef()?.nativeElement;
    if (el) {
      el.value = text;
      this.autoGrow(el);
    }
  }

  readonly tenDangTraLoi = computed(() => {
    const m = this.replyingTo();
    if (!m) return '';
    if (m.userId === this.currentUserId()) return 'chính mình';
    return m.user?.displayName ?? 'Anonymous';
  });

  readonly trichDoan = computed(() => {
    const m = this.replyingTo();
    if (!m) return '';
    if (m.deletedAt) return 'Tin nhắn đã được thu hồi';
    return m.content.length > 90 ? m.content.slice(0, 90) + '…' : m.content;
  });

  readonly mentionOpen = computed(() => this.mentionQuery() !== null);
  readonly mentionMatches = computed(() => {
    const q = this.mentionQuery();
    if (q === null) return [];
    const lower = q.toLowerCase();
    return this.members()
      .filter((m) => (m.displayName ?? m.email).toLowerCase().startsWith(lower))
      .slice(0, 5);
  });

  constructor() {
    // Bắt đầu sửa thì đổ nội dung cũ vào ô soạn; thoát sửa thì dọn sạch.
    // `syncTextarea` là bắt buộc — xem chú thích ở `textareaRef`.
    effect(() => {
      const m = this.editing();
      const text = m?.content ?? '';
      this.value.set(text);
      this.syncTextarea(text);
    });
  }

  onInput(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    this.value.set(el.value);
    this.autoGrow(el);
    const caret = el.selectionStart ?? el.value.length;
    const upToCaret = el.value.slice(0, caret);
    const atIndex = upToCaret.lastIndexOf('@');
    if (atIndex === -1) {
      this.mentionQuery.set(null);
      return;
    }
    const term = upToCaret.slice(atIndex + 1);
    if (/\s/.test(term)) {
      this.mentionQuery.set(null);
      return;
    }
    this.mentionQuery.set(term);
  }

  /**
   * Textarea tự cao dần theo số dòng đang gõ.
   *
   * `height = 'auto'` trước khi đo là bắt buộc: không có bước đó thì
   * `scrollHeight` vẫn tính theo chiều cao CŨ, nên ô chỉ phình ra mà không bao
   * giờ co lại khi người dùng xoá bớt dòng.
   */
  private autoGrow(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = `${Math.max(40, Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT))}px`;
  }

  /** Enter để gửi, Shift+Enter để xuống dòng — không chặn IME (gõ tiếng Việt/Nhật...). */
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && (this.replyingTo() || this.editing())) {
      event.preventDefault();
      this.cancelContext.emit();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.onSend();
    }
  }

  pickMention(member: User, inputEl: HTMLTextAreaElement): void {
    const name = member.displayName ?? member.email;
    const caret = inputEl.selectionStart ?? this.value().length;
    const upToCaret = this.value().slice(0, caret);
    const atIndex = upToCaret.lastIndexOf('@');
    if (atIndex === -1) return;

    const before = this.value().slice(0, atIndex);
    const after = this.value().slice(caret);
    const next = `${before}@${name} ${after}`;
    this.value.set(next);
    this.syncTextarea(next);
    this.mentionQuery.set(null);

    const caretPos = (before + '@' + name + ' ').length;
    setTimeout(() => {
      inputEl.focus();
      inputEl.setSelectionRange(caretPos, caretPos);
    });
  }

  onSend(): void {
    const text = this.value().trim();
    if (!text) return;

    const dangSua = this.editing();
    if (dangSua) {
      this.saveEdit.emit({ id: dangSua.id, text });
    } else {
      this.send.emit({ text, replyToId: this.replyingTo()?.id });
    }

    this.value.set('');
    this.syncTextarea('');
    this.mentionQuery.set(null);
  }
}
