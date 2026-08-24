import { Component, computed, input } from '@angular/core';
import { Message, User } from '../../../models';
import { avatarColorFor, initialsOf } from '../../../utils/avatar.util';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface ContentPart {
  text: string;
  isMention: boolean;
}

/** 1 tin nhắn: căn phải/trái theo "mình" hay "người khác" + avatar, @nhắc tên tô màu (#8). */
@Component({
  selector: 'app-message-item',
  imports: [],
  templateUrl: './message-item.html',
  styleUrl: './message-item.css',
})
export class MessageItem {
  readonly message = input.required<Message>();
  readonly sender = input<User | null>(null);
  readonly isOwn = input(false);
  readonly memberNames = input<string[]>([]);

  readonly senderLabel = computed(() => {
    if (this.isOwn()) return 'You';
    const s = this.sender();
    return s?.displayName ?? s?.email ?? 'Anonymous';
  });

  readonly initials = computed(() => initialsOf(this.senderLabel()));
  readonly avatarColor = computed(() => avatarColorFor(this.sender()?.id ?? this.message().userId));

  readonly bubbleClass = computed(() =>
    this.isOwn()
      ? 'w-fit max-w-full min-w-0 break-words rounded-xl rounded-tr-[3px] bg-primary/10 px-2.5 py-1.5 text-xs leading-relaxed text-base-content'
      : 'w-fit max-w-full min-w-0 break-words rounded-xl rounded-tl-[3px] bg-base-200 px-2.5 py-1.5 text-xs leading-relaxed text-base-content',
  );

  readonly timeLabel = computed(() => {
    const d = new Date(this.message().createdAt);
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  });

  readonly contentParts = computed<ContentPart[]>(() => {
    const content = this.message().content;
    const names = [...this.memberNames()].sort((a, b) => b.length - a.length);
    if (!names.length) return [{ text: content, isMention: false }];

    const pattern = new RegExp(`@(${names.map(escapeRegExp).join('|')})`, 'g');
    const parts: ContentPart[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content))) {
      if (match.index > lastIndex) parts.push({ text: content.slice(lastIndex, match.index), isMention: false });
      parts.push({ text: match[0], isMention: true });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) parts.push({ text: content.slice(lastIndex), isMention: false });
    return parts;
  });
}
