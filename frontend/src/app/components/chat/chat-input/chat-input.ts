import { Component, computed, input, output, signal } from '@angular/core';
import { User } from '../../../models';

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
    const el = event.target as HTMLInputElement;
    this.value.set(el.value);
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

  pickMention(member: User, inputEl: HTMLInputElement): void {
    const name = member.displayName ?? member.email;
    const caret = inputEl.selectionStart ?? this.value().length;
    const upToCaret = this.value().slice(0, caret);
    const atIndex = upToCaret.lastIndexOf('@');
    if (atIndex === -1) return;

    const before = this.value().slice(0, atIndex);
    const after = this.value().slice(caret);
    const next = `${before}@${name} ${after}`;
    this.value.set(next);
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
    this.mentionQuery.set(null);
  }
}
