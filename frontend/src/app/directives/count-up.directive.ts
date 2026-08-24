import { Directive, ElementRef, OnDestroy, OnInit, inject, input } from '@angular/core';

/**
 * Đếm số từ 0 lên giá trị đích khi ô số cuộn vào khung nhìn.
 *
 * Chỉ chạy MỘT LẦN rồi `unobserve` ngay trong callback: số nhảy lại mỗi lần cuộn
 * qua vừa gây rối mắt vừa giữ observer sống vô ích suốt vòng đời trang.
 *
 * Ghi thẳng `textContent` thay vì binding: đây là 60 lần cập nhật mỗi giây trong
 * 1,4 giây — cho từng khung hình đi qua change detection của Angular là phí.
 *
 * Người bật "giảm chuyển động" thấy ngay số cuối, không có màn đếm.
 */
@Directive({ selector: '[appCountUp]' })
export class CountUpDirective implements OnInit, OnDestroy {
  /** Giá trị đích. */
  readonly countTo = input.required<number>();
  /** Đuôi dán sau số: "%", "+", "ms"... */
  readonly countSuffix = input('');
  /** Số chữ số thập phân — dùng cho các giá trị kiểu 4.5. */
  readonly countDecimals = input(0);
  /** Thời lượng đếm (ms). */
  readonly countDuration = input(1400);

  private readonly host = inject(ElementRef<HTMLElement>);

  private readonly el: HTMLElement = this.host.nativeElement;
  private observer?: IntersectionObserver;
  private frame = 0;

  /* Dựng ở ngOnInit chứ không phải constructor: `countTo` là input bắt buộc và
     chưa có giá trị lúc constructor chạy — trình biên dịch Angular chặn ngay
     (NG8118), và kể cả không chặn thì cũng đọc ra undefined. */
  ngOnInit(): void {
    // Chỗ giữ chỗ lúc chưa đếm là "0" chứ không phải rỗng: nếu để rỗng, cả dải
    // số liệu sẽ co lại rồi bung ra khi đếm xong — một cú nhảy layout ngay giữa
    // tầm mắt. Có sẵn một ký tự thì chiều cao dòng đã đúng từ đầu.
    this.el.textContent = `0${this.countSuffix()}`;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      this.render(this.countTo());
      return;
    }

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
    const target = this.countTo();
    const duration = this.countDuration();
    const start = performance.now();

    const tick = (now: number): void => {
      const t = Math.min((now - start) / duration, 1);
      // easeOutExpo — vọt lên rất nhanh rồi hãm dần, đọc ra là "đang chốt số"
      // chứ không phải một thanh trượt tăng đều vô hồn.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      this.render(target * eased);
      if (t < 1) this.frame = requestAnimationFrame(tick);
    };

    this.frame = requestAnimationFrame(tick);
  }

  private render(value: number): void {
    this.el.textContent = value.toFixed(this.countDecimals()) + this.countSuffix();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    if (this.frame) cancelAnimationFrame(this.frame);
  }
}
