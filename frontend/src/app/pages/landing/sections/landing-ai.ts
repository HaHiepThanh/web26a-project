import { Component, ElementRef, OnDestroy, inject, signal } from '@angular/core';
import {
  LucideArrowRight,
  LucideCheck,
  LucideHash,
  LucideSend,
  LucideSparkles,
  LucideX,
} from '@lucide/angular';
import { RevealDirective } from '../../../directives/reveal.directive';
import { ScrambleInDirective } from '../../../directives/scramble-in.directive';

/**
 * Các chặng của màn diễn. Thứ tự trong union cũng là thứ tự thời gian.
 */
type Phase = 'idle' | 'typing' | 'sent' | 'thinking' | 'suggest' | 'created';

/** Câu nhắn mẫu.
 *  ⚠️ Bản tiếng Việt của câu này cố ý chứa "giúp mình" và "trước" — đúng hai từ
 *  khoá mà `AiService.detectTask()` thật đang bắt, để demo không nói dối về sản
 *  phẩm. Bản tiếng Anh dưới đây CHƯA có tính chất đó, vì `TASK_KEYWORDS` trong
 *  services/ai.service.ts vẫn còn là tiếng Việt. Khi dịch service đó sang tiếng
 *  Anh thì nhớ chọn từ khoá sao cho câu này vẫn khớp. */
const MESSAGE = '@Huy can you finish the demo slides before Friday';

/** Nhịp của màn diễn (ms). Gom một chỗ để chỉnh tiết tấu không phải đi lục code. */
const BEAT = {
  beforeTyping: 700,
  perChar: 42,
  afterTyping: 520,
  thinking: 1150,
  readSuggestion: 3200,
  afterCreated: 2600,
} as const;

/**
 * Khoảnh khắc chữ ký của sản phẩm: AI đọc tin nhắn trong chat rồi ĐỀ NGHỊ một
 * thẻ việc — và dừng lại chờ người bấm xác nhận.
 *
 * Cái nút "Tạo thẻ" ở cuối không phải trang trí: nó chính là luận điểm. Nhiều
 * công cụ AI tự ý tạo dữ liệu rồi bắt người dùng đi dọn; ở đây AI chỉ được
 * quyền gợi ý. Màn diễn cố tình dừng lâu ở bước đó để người xem kịp nhận ra.
 *
 * Vòng lặp chỉ chạy khi khu vực này nằm trong khung nhìn. IntersectionObserver
 * bật/tắt nó — cuộn qua rồi thì mọi hẹn giờ bị huỷ, không có timer nào âm thầm
 * gõ chữ ở khúc trang mà người dùng đã bỏ lại phía sau.
 */
@Component({
  selector: 'app-landing-ai',
  imports: [
    RevealDirective,
    ScrambleInDirective,
    LucideArrowRight,
    LucideCheck,
    LucideHash,
    LucideSend,
    LucideSparkles,
    LucideX,
  ],
  templateUrl: './landing-ai.html',
  styleUrls: ['../_landing-shared.css', './landing-ai.css'],
})
export class LandingAi implements OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly phase = signal<Phase>('idle');
  /** Phần chữ đã gõ ra tới thời điểm hiện tại. */
  readonly typed = signal('');

  /** Tách sẵn phần @nhắc-tên để tô riêng trong bong bóng chat. Cắt ở đây chứ
   *  không phải trong template: template không nên biết câu mẫu dài bao nhiêu. */
  readonly mention = MESSAGE.slice(0, MESSAGE.indexOf(' '));
  readonly messageRest = MESSAGE.slice(MESSAGE.indexOf(' '));

  readonly points = [
    {
      title: 'It reads only what matters',
      desc: 'A message is considered only when it looks like an assignment — an @mention, a "before Friday", a "can you".',
    },
    {
      title: 'It suggests, it never decides',
      desc: 'The title and the assignee arrive filled in. The card exists only once you confirm it.',
    },
    {
      title: 'Dismissing costs nothing',
      desc: 'A bad guess gets a "Dismiss". The conversation is untouched and the board stays clean.',
    },
  ];

  private timer?: ReturnType<typeof setTimeout>;
  private observer?: IntersectionObserver;
  private running = false;
  /** Bản tĩnh: dựng sẵn cảnh, không có vòng lặp nào chạy. */
  private readonly staticScene: boolean;

  constructor() {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.staticScene = reduced || typeof IntersectionObserver === 'undefined';

    // Với người bật "giảm chuyển động": dựng sẵn cảnh ở đúng chặng quan trọng
    // nhất — tin nhắn đã gửi, thẻ gợi ý đã hiện, nút xác nhận vẫn bấm được.
    // Nội dung không mất gì, chỉ mất phần chuyển động dẫn tới nó.
    if (this.staticScene) {
      this.typed.set(MESSAGE);
      this.phase.set('suggest');
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) this.start();
          else this.stop();
        }
      },
      // 0.35: đợi khu vực vào sâu hơn một phần ba màn hình mới diễn. Bắt đầu
      // ngay lúc mới ló mép trên thì người dùng đã bỏ lỡ đoạn gõ chữ.
      { threshold: 0.35 },
    );
    this.observer.observe(this.host.nativeElement as HTMLElement);
  }

  /** Người xem tự bấm "Tạo thẻ" — nhảy thẳng tới kết quả, không phải chờ. */
  confirm(): void {
    if (this.phase() !== 'suggest') return;
    this.clearTimer();
    this.phase.set('created');
    // Bản tĩnh thì dừng ở kết quả luôn: tự diễn lại chính là thứ chế độ "giảm
    // chuyển động" muốn tránh.
    if (!this.staticScene) this.after(BEAT.afterCreated, () => this.replay());
  }

  /** Người xem bấm "Bỏ qua" — thẻ gợi ý biến mất, tin nhắn ở lại. */
  dismiss(): void {
    if (this.phase() !== 'suggest') return;
    this.clearTimer();
    // Bản tĩnh: dừng ở cảnh "đã bỏ qua" thay vì diễn lại từ đầu — nếu replay
    // thì hẹn giờ bị chặn bởi cờ `running`, khung chat sẽ trống trơn.
    if (this.staticScene) this.phase.set('sent');
    else this.replay();
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.replay();
  }

  private stop(): void {
    this.running = false;
    this.clearTimer();
    this.phase.set('idle');
    this.typed.set('');
  }

  private replay(): void {
    this.phase.set('idle');
    this.typed.set('');
    this.after(BEAT.beforeTyping, () => {
      this.phase.set('typing');
      this.typeNext(0);
    });
  }

  /**
   * Gõ từng ký tự bằng chuỗi setTimeout lồng nhau chứ không phải setInterval:
   * setInterval giữ nguyên nhịp kể cả khi tab bị treo hay trình duyệt bóp ga,
   * dồn lại rồi bắn một loạt callback cùng lúc — chữ nhảy ra thành từng cục.
   * Hẹn lại sau mỗi ký tự thì nhịp luôn đúng, và huỷ giữa chừng cũng gọn.
   */
  private typeNext(index: number): void {
    if (index >= MESSAGE.length) {
      this.after(BEAT.afterTyping, () => {
        this.phase.set('sent');
        this.after(220, () => {
          this.phase.set('thinking');
          this.after(BEAT.thinking, () => {
            this.phase.set('suggest');
            this.after(BEAT.readSuggestion, () => {
              // Hết giờ mà người xem không bấm gì: tự xác nhận để kể nốt câu
              // chuyện. Trong app thật thì nó sẽ nằm im chờ mãi.
              this.phase.set('created');
              this.after(BEAT.afterCreated, () => this.replay());
            });
          });
        });
      });
      return;
    }

    this.typed.set(MESSAGE.slice(0, index + 1));
    // Dấu cách được nghỉ dài hơn một chút — người thật gõ cũng ngắt nhịp ở đó,
    // nhịp đều tăm tắp nghe ra ngay là máy.
    const pause = MESSAGE[index] === ' ' ? BEAT.perChar * 2.4 : BEAT.perChar;
    this.after(pause, () => this.typeNext(index + 1));
  }

  private after(delay: number, fn: () => void): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.running) fn();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.clearTimer();
  }
}
