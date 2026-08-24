import { Directive, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';

/** Bảng ký tự dùng để "xáo" — chữ hoa + số, không lẫn dấu câu cho đỡ rối mắt. */
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
/** Mỗi lần cập nhật cách nhau bấy nhiêu ms — đủ nhanh để trông như "nhiễu", đủ
 *  chậm để mắt còn kịp thấy ký tự đang đổi chứ không mờ thành một vệt. */
const TICK_MS = 45;
/** Mỗi ký tự "chốt" trễ hơn ký tự trước bấy nhiêu ms — tạo hiệu ứng chốt dần từ
 *  trái sang phải thay vì cả cụm từ bật ra cùng lúc. */
const STAGGER_MS = 30;

/**
 * Cụm chữ tô màu (`.lp-grad`) tự "giải mã" từ ký tự ngẫu nhiên ra chữ thật khi
 * cuộn tới — mô phỏng hiệu ứng scramble-in của fancycomponents.dev, áp cho đúng
 * phần chữ đã được nhấn mạnh bằng màu gradient thay vì cả câu, để tinh nghịch mà
 * không loãng thông điệp.
 *
 * Cách dùng: <span class="lp-grad" appScrambleIn>on one board</span>
 *
 * CHỈ đọc `textContent` một lần lúc khởi tạo rồi phát lại đúng chuỗi đó khi
 * "chốt" — hiệu ứng thuần thị giác, không đổi nội dung thật của trang, nên
 * không ảnh hưởng gì tới SEO/trình đọc màn hình (chúng đọc DOM ở trạng thái
 * cuối, giống hệt bản chưa có hiệu ứng).
 *
 * Khoảng trắng (kể cả &nbsp;) giữ nguyên, không xáo — xáo cả khoảng trắng thì
 * cụm từ nhìn như dính liền, và với hero (dùng &nbsp; để khoá điểm ngắt dòng)
 * xáo mất khoảng trắng sẽ phá luôn lý do &nbsp; có mặt ở đó.
 *
 * Cùng khuôn IntersectionObserver + prefers-reduced-motion với RevealDirective/
 * CountUpDirective: chạy đúng MỘT LẦN khi lọt khung nhìn, hiện thẳng chữ cuối
 * nếu người dùng đã bật "giảm chuyển động".
 */
@Directive({ selector: '[appScrambleIn]' })
export class ScrambleInDirective implements OnInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly el: HTMLElement = this.host.nativeElement;

  private finalText = '';
  private observer?: IntersectionObserver;
  private timer?: ReturnType<typeof setInterval>;
  private startedAt = 0;

  ngOnInit(): void {
    this.finalText = this.el.textContent ?? '';

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined' || !this.finalText.trim()) return;

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          this.observer?.unobserve(this.el);
          this.observer = undefined;
          this.run();
        }
      },
      { threshold: 0.5 },
    );
    this.observer.observe(this.el);
  }

  private run(): void {
    this.startedAt = performance.now();
    const lastRevealAt = (this.finalText.length - 1) * STAGGER_MS;

    this.timer = setInterval(() => {
      const elapsed = performance.now() - this.startedAt;

      let out = '';
      for (let i = 0; i < this.finalText.length; i++) {
        const ch = this.finalText[i];
        if (/\s/.test(ch)) {
          out += ch;
          continue;
        }
        out += elapsed >= i * STAGGER_MS ? ch : this.randomChar();
      }
      this.el.textContent = out;

      if (elapsed >= lastRevealAt) {
        this.el.textContent = this.finalText;
        this.clearTimer();
      }
    }, TICK_MS);
  }

  private randomChar(): string {
    return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
  }

  private clearTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.clearTimer();
  }
}
