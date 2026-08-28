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

  /** Tên THẬT của người gửi — `senderLabel()` trả "You" nên không dùng để ghép câu được. */
  readonly tenNguoiGui = computed(() => {
    const s = this.sender() ?? this.message().user;
    return s?.displayName ?? s?.email ?? 'Anonymous';
  });

  /**
   * Câu "ai trả lời ai" đặt phía trên bong bóng, theo lối Messenger.
   *
   * Thay cho việc ghi tên người được trích ngay trong ô trích dẫn: đọc "Bạn đã
   * trả lời chính mình" nhanh hơn nhiều so với việc nhìn một cái tên rồi tự đối
   * chiếu xem nó là ai.
   */
  readonly nhanTraLoi = computed(() => {
    const q = this.trichDan();
    if (!q) return '';
    const toi = q.userId === this.currentUserId();
    if (this.isOwn()) return toi ? 'Bạn đã trả lời chính mình' : `Bạn đã trả lời ${this.tenTrichDan()}`;
    return toi
      ? `${this.tenNguoiGui()} đã trả lời bạn`
      : `${this.tenNguoiGui()} đã trả lời ${this.tenTrichDan()}`;
  });

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
    // Lớp thật nằm ở message-item.css — `ring` cắt ngang đuôi bong bóng.
    if (this.highlighted()) c += ' dang-sang';
    return c;
  });

  /**
   * Ô trích dẫn — nay nằm NGOÀI bong bóng, ở hàng `chat-header` phía trên,
   * đúng lối Messenger.
   *
   * Nhờ ra ngoài mà nó hết phụ thuộc nền bong bóng: bản trước phải nuôi hai bộ
   * màu (một cho nền primary đặc, một cho nền thường) vì đặt lồng bên trong.
   * `place-items` của daisyUI tự căn nó về đúng phía trái/phải.
   */
  readonly quoteClass = computed(
    () =>
      // `border-base-300` chứ không phải một sắc độ tự chế: `styles.css` có sẵn
      // một quy tắc trong @layer utilities đổi mọi `border-base-300` sang
      // `--border-color` khi ở theme `night`. Nhờ vậy ô trích dẫn có cùng viền
      // với nút Start meeting / Filter, và chỉnh một chỗ là đổi cả app.
      'block w-fit max-w-full overflow-hidden rounded-md border border-base-300 ' +
      'bg-base-200 px-2.5 py-1 text-left text-3xs leading-snug ' +
      'text-base-content/70 transition-colors hover:bg-base-300',
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
