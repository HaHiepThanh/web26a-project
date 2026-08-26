import { Component, computed, input } from '@angular/core';
import { Message, User } from '../../../models';
import { UserAvatar } from '../../shared/user-avatar/user-avatar';

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
  imports: [UserAvatar],
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

  /** Tên dùng cho avatar — luôn là tên thật, kể cả tin của mình. `senderLabel()`
   *  hiện "You" ở nhãn phía trên bong bóng, nhưng lấy chữ cái đầu từ đó thì
   *  avatar của chính mình thành chữ "Y" thay vì tên mình. */
  readonly avatarName = computed(() => {
    const s = this.sender() ?? this.message().user;
    return s?.displayName ?? s?.email ?? this.senderLabel();
  });

  /** Backend trả kèm `user` trong từng tin nhắn; `sender` (tra từ danh sách thành
   *  viên) chỉ là nguồn ưu tiên, thiếu thì rơi về bản đính kèm tin nhắn. */
  readonly avatarUrl = computed(() => this.sender()?.avatarUrl ?? this.message().user?.avatarUrl);

  /**
   * Bong bóng theo daisyUI (`chat-bubble`), đè lại vài kích thước cho vừa khung
   * chat hẹp ~300px: daisyUI mặc định `min-height: 2rem` + `padding-inline: 1rem`
   * là quá rộng rãi ở đây, tin một dòng sẽ cao gần gấp đôi nội dung thật.
   */
  readonly bubbleClass = computed(() => {
    const chung = 'chat-bubble min-h-0 min-w-0 break-words px-3 py-1.5 text-xs leading-relaxed';
    return this.isOwn() ? `${chung} chat-bubble-primary` : chung;
  });

  /**
   * Cách tô @nhắc tên, PHỤ THUỘC nền bong bóng.
   *
   * Tin của mình dùng `chat-bubble-primary` — nền primary đặc. Tô chữ
   * `text-primary` lên đó là chữ primary trên nền primary: gần như tàng hình.
   * Nên ở bong bóng đó dùng gạch chân + in đậm, giữ nguyên màu chữ tương phản
   * mà daisyUI đã chọn sẵn (`--color-primary-content`).
   */
  readonly mentionClass = computed(() =>
    this.isOwn() ? 'font-bold underline underline-offset-2' : 'font-semibold text-primary',
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
