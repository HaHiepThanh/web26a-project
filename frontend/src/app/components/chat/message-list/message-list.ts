import { Component, ElementRef, effect, input, output, signal, viewChild } from '@angular/core';
import { ChatTaskSuggestion, Message, User } from '../../../models';
import { MessageItem } from '../message-item/message-item';
import { TaskSuggestionCard } from '../task-suggestion-card/task-suggestion-card';
import { trongTamNhin } from '../../../utils/trong-tam-nhin.util';

/** Nháy sáng bao lâu rồi tắt. */
const SANG_MS = 1600;

/** Đang ở "gần đáy" nếu còn cách đáy dưới ngần này pixel. */
const GAN_DAY_PX = 80;

/** Bấm ô trích dẫn mà tin gốc chưa nạp thì lần ngược tối đa ngần này trang. */
const TOI_DA_LAN_NGUOC = 5;

@Component({
  selector: 'app-message-list',
  imports: [MessageItem, TaskSuggestionCard],
  templateUrl: './message-list.html',
  styleUrl: './message-list.css',
})
export class MessageList {
  readonly messages = input<Message[]>([]);
  readonly usersById = input<Record<string, User | undefined>>({});
  readonly currentUserId = input<string>('');
  readonly memberNames = input<string[]>([]);
  readonly members = input<User[]>([]);

  /** Còn tin cũ hơn để cuộn lên không. */
  readonly hasMore = input(false);
  /**
   * Nạp thêm một trang cũ hơn; trả `true` nếu có nạp được tin.
   *
   * Truyền vào dạng HÀM chứ không phải sự kiện `output` vì việc lần ngược tìm
   * một tin bị trích dẫn cần BIẾT KẾT QUẢ từng lượt để quyết định có thử tiếp
   * không. `output` thì bắn đi là xong, không ai trả lời lại được.
   */
  readonly taiThem = input<(() => Promise<boolean>) | null>(null);

  /**
   * Gợi ý tra theo `messageId`.
   *
   * Vẽ chip ngay dưới ĐÚNG tin nhắn sinh ra nó, thay vì ghim một cái ở cuối danh
   * sách như bản trước — người đọc phải biết gợi ý đến từ câu nào, nhất là khi
   * chat đang trôi nhanh.
   */
  readonly suggestionsByMessageId = input<Record<string, ChatTaskSuggestion | undefined>>({});

  readonly openSuggestion = output<ChatTaskSuggestion>();
  readonly dismissSuggestion = output<ChatTaskSuggestion>();
  readonly reply = output<Message>();
  readonly startEdit = output<Message>();
  readonly recall = output<Message>();

  private readonly scrollArea = viewChild<ElementRef<HTMLDivElement>>('scrollArea');
  private readonly moc = viewChild<ElementRef<HTMLDivElement>>('moc');

  readonly dangSang = signal<string | null>(null);
  /** Lần ngược hết số trang cho phép mà vẫn không thấy tin gốc. */
  readonly khongTimThay = signal(false);

  /** Người dùng có đang ở gần đáy không — cập nhật liên tục theo mỗi lần cuộn. */
  private ganDay = true;
  /** Chiều cao trước khi chèn tin cũ, để cộng bù lại đúng bằng phần vừa mọc thêm. */
  private caoTruocKhiChen: number | null = null;
  private hen: ReturnType<typeof setTimeout> | null = null;
  private daGanObserver = false;

  constructor() {
    // Gắn IntersectionObserver một lần, ngay khi có đủ hai phần tử.
    effect(() => {
      const khung = this.scrollArea()?.nativeElement;
      const moc = this.moc()?.nativeElement;
      if (!khung || !moc || this.daGanObserver) return;
      this.daGanObserver = true;

      new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) void this.nap();
        },
        { root: khung, rootMargin: '120px 0px 0px 0px' },
      ).observe(moc);
    });

    effect(() => {
      this.messages();
      this.suggestionsByMessageId();
      queueMicrotask(() => this.sauKhiVe());
    });
  }

  /**
   * Chạy sau mỗi lần danh sách đổi. Hai việc loại trừ nhau:
   *
   * 1. Vừa CHÈN TIN CŨ vào đầu → cộng bù đúng phần chiều cao vừa mọc thêm, giữ
   *    nguyên chỗ đang đọc. Thiếu bước này thì mỗi lần tải thêm nội dung nhảy giật.
   *
   * 2. Có tin MỚI ở cuối → chỉ tự cuộn xuống khi người dùng ĐANG Ở GẦN ĐÁY.
   *    Bản trước cuộn xuống đáy vô điều kiện, nên vừa kéo lên xem tin cũ là bị
   *    quăng ngược xuống — phân trang coi như không dùng được.
   */
  private sauKhiVe(): void {
    const el = this.scrollArea()?.nativeElement;
    if (!el) return;

    if (this.caoTruocKhiChen !== null) {
      el.scrollTop += el.scrollHeight - this.caoTruocKhiChen;
      this.caoTruocKhiChen = null;
      return;
    }
    if (this.ganDay) el.scrollTop = el.scrollHeight;
  }

  onScroll(): void {
    const el = this.scrollArea()?.nativeElement;
    if (!el) return;
    this.ganDay = el.scrollHeight - el.scrollTop - el.clientHeight < GAN_DAY_PX;
  }

  /** Nạp một trang cũ hơn, có ghi lại chiều cao để `sauKhiVe` cộng bù. */
  private async nap(): Promise<boolean> {
    const tai = this.taiThem();
    const el = this.scrollArea()?.nativeElement;
    if (!tai || !el || !this.hasMore()) return false;
    this.caoTruocKhiChen = el.scrollHeight;
    const duoc = await tai();
    if (!duoc) this.caoTruocKhiChen = null;
    return duoc;
  }

  /**
   * Bấm vào ô trích dẫn.
   *
   * Nằm trong tầm nhìn → chỉ nháy sáng. Ló ra ngoài → cuộn tới rồi mới nháy.
   * Chưa nạp → lần ngược từng trang cho tới khi thấy, có trần.
   */
  async nhayToi(id: string): Promise<void> {
    this.khongTimThay.set(false);
    for (let i = 0; i <= TOI_DA_LAN_NGUOC; i++) {
      const el = this.timPhanTu(id);
      if (el) {
        this.dua(el);
        this.sang(id);
        return;
      }
      if (!(await this.nap())) break;
      // Nhường một nhịp cho Angular vẽ xong trang vừa nạp.
      await new Promise((r) => setTimeout(r, 0));
    }
    this.khongTimThay.set(true);
    setTimeout(() => this.khongTimThay.set(false), SANG_MS * 2);
  }

  private timPhanTu(id: string): HTMLElement | null {
    const khung = this.scrollArea()?.nativeElement;
    // CSS.escape: id là uuid nên an toàn, nhưng đừng để một id lạ biến thành
    // bộ chọn hỏng rồi ném lỗi ra giữa luồng.
    return khung?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`) ?? null;
  }

  private dua(el: HTMLElement): void {
    const khung = this.scrollArea()?.nativeElement;
    if (!khung) return;
    const a = el.getBoundingClientRect();
    const b = khung.getBoundingClientRect();
    if (trongTamNhin({ top: a.top, bottom: a.bottom }, { top: b.top, bottom: b.bottom })) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  private sang(id: string): void {
    if (this.hen) clearTimeout(this.hen);
    this.dangSang.set(id);
    this.hen = setTimeout(() => this.dangSang.set(null), SANG_MS);
  }

  trackByMessageId(_: number, m: Message): string {
    return m.id;
  }
}
