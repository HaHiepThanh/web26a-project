import { Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';
import { User } from '../../../models';

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
  readonly send = output<string>();

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

  readonly mentionOpen = computed(() => this.mentionQuery() !== null);
  readonly mentionMatches = computed(() => {
    const q = this.mentionQuery();
    if (q === null) return [];
    const lower = q.toLowerCase();
    return this.members()
      .filter((m) => (m.displayName ?? m.email).toLowerCase().startsWith(lower))
      .slice(0, 5);
  });

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
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
  }

  /** Enter để gửi, Shift+Enter để xuống dòng — không chặn IME (gõ tiếng Việt/Nhật...). */
  onKeydown(event: KeyboardEvent): void {
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
    this.send.emit(text);
    this.value.set('');
    this.syncTextarea('');
    this.mentionQuery.set(null);
  }
}
