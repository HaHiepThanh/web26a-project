import { Component, computed, input, output } from '@angular/core';
import { Message, User } from '../../../models';
import { UserAvatar } from '../../shared/user-avatar/user-avatar';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface ContentPart {
  text: string;
  isMention: boolean;
}

export const NHAN_THU_HOI = 'Tin nhắn đã được thu hồi';

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
  /** Để biết ô trích dẫn nên ghi tên người hay ghi "You". */
  readonly currentUserId = input<string>('');
  /** Đang được nháy sáng vì vừa có người bấm vào ô trích dẫn trỏ tới nó. */
  readonly highlighted = input(false);

  readonly reply = output<Message>();
  readonly startEdit = output<Message>();
  readonly recall = output<Message>();
  /** Bấm vào ô trích dẫn → nhảy tới tin gốc. */
  readonly jumpTo = output<string>();

  readonly nhanThuHoi = NHAN_THU_HOI;

  readonly daThuHoi = computed(() => !!this.message().deletedAt);
  /** Tin đã thu hồi thì không còn khái niệm "đã sửa" nữa. */
  readonly daSua = computed(() => !this.daThuHoi() && !!this.message().editedAt);
  /** Chỉ người gửi mới sửa/thu hồi được — server cũng kiểm lại, đây chỉ là phép lịch sự. */
  readonly suaDuoc = computed(() => this.isOwn() && !this.daThuHoi());

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
   * Ô trích dẫn.
   *
   * ⚠️ `MessageQuote` CỐ Ý không có `replyTo` lồng bên trong — xem chú thích ở
   *    `message.model.ts`. Nên ở đây không có nhánh đệ quy nào, và cũng không
   *    được thêm: A trả lời B, C trả lời A, D trả lời C… lồng tới tầng thứ ba
   *    là bể khung chat ~300px.
   */
  readonly trichDan = computed(() => this.message().replyTo ?? null);

  readonly tenTrichDan = computed(() => {
    const q = this.trichDan();
    if (!q) return '';
    if (q.userId === this.currentUserId()) return 'You';
    return q.user?.displayName ?? 'Anonymous';
  });

  readonly noiDungTrichDan = computed(() => {
    const q = this.trichDan();
    if (!q) return '';
    return q.deletedAt ? NHAN_THU_HOI : q.content;
  });

  /**
   * Bong bóng theo daisyUI (`chat-bubble`), đè lại vài kích thước cho vừa khung
   * chat hẹp ~300px: daisyUI mặc định `min-height: 2rem` + `padding-inline: 1rem`
   * là quá rộng rãi ở đây, tin một dòng sẽ cao gần gấp đôi nội dung thật.
   */
  readonly bubbleClass = computed(() => {
    let c = 'chat-bubble min-h-0 min-w-0 break-words px-3 py-1.5 text-xs leading-relaxed transition-shadow';
    if (this.isOwn()) c += ' chat-bubble-primary';
    if (this.highlighted()) c += ' ring-2 ring-warning ring-offset-1 ring-offset-base-100';
    return c;
  });

  /**
   * Ô trích dẫn cũng PHỤ THUỘC nền bong bóng, y hệt `mentionClass`.
   *
   * Trên `chat-bubble-primary` (nền primary đặc) mà dùng `bg-base-content/10`
   * thì ô trích dẫn gần như tàng hình. Phải mượn `primary-content` — màu chữ
   * tương phản mà daisyUI đã chọn sẵn cho nền đó.
   */
  readonly quoteClass = computed(() => {
    // GỘP HẾT vào một chuỗi thay vì trộn `class="..."` tĩnh với `[class]`:
    // hai nguồn cho cùng một thuộc tính là chỗ rất dễ tưởng nhầm cái nào thắng.
    //
    // `w-fit` chứ KHÔNG `w-full`: ô trích dẫn full-width kéo bong bóng nở hết
    // cỡ, nên một câu "Ừ" hai ký tự cũng thành khối to bằng cả khung chat.
    const chung =
      'mb-1.5 block w-fit max-w-full overflow-hidden rounded-md border-l-[3px] ' +
      'px-2 py-1 text-left leading-snug transition-opacity hover:opacity-75';
    return this.isOwn()
      ? `${chung} border-primary-content bg-primary-content/25 text-primary-content`
      : `${chung} border-primary bg-base-100 text-base-content`;
  });

  /** Tên người được trích — mượn màu nhấn để mắt bắt được ngay đây là "của ai". */
  readonly quoteNameClass = computed(() =>
    this.isOwn()
      ? 'block text-3xs font-bold text-primary-content'
      : 'block text-3xs font-bold text-primary',
  );

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
