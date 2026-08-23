import { Directive, ElementRef, OnDestroy, inject, input } from '@angular/core';

/**
 * Hiện phần tử khi cuộn tới (scroll reveal).
 *
 * Cách dùng: <div appReveal [revealDelay]="120"> — phần tử bắt đầu ở trạng thái
 * mờ + dịch xuống 24px (định nghĩa ở landing.css), khi lọt vào khung nhìn thì
 * thêm class `is-revealed` để chạy transition.
 *
 * Vì sao dùng IntersectionObserver chứ không nghe sự kiện scroll: sự kiện scroll
 * bắn hàng trăm lần/giây và mỗi lần đọc getBoundingClientRect() lại ép trình duyệt
 * tính lại layout (layout thrashing) → giật trên máy yếu. IntersectionObserver để
 * trình duyệt tự tính off-main-thread, chỉ gọi callback đúng lúc cắt ngưỡng.
 *
 * Chỉ hiện MỘT LẦN rồi ngắt theo dõi: nội dung nhấp nháy lại mỗi lần cuộn qua là
 * gây khó chịu, và với người nhạy cảm chuyển động thì còn là rào cản thật sự.
 */
@Directive({
  selector: '[appReveal]',
  host: { class: 'reveal' },
})
export class RevealDirective implements OnDestroy {
  /** Trễ (ms) trước khi hiện — dùng để xếp so le (stagger) một hàng thẻ. */
  readonly revealDelay = input(0);

  private readonly host = inject(ElementRef<HTMLElement>);
  private observer?: IntersectionObserver;

  constructor() {
    const el = this.host.nativeElement as HTMLElement;

    // Tôn trọng cài đặt "giảm chuyển động" của hệ điều hành: hiện ngay, không
    // hoạt ảnh. Người bị rối loạn tiền đình có thể chóng mặt vì hiệu ứng trượt.
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-revealed');
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          el.style.transitionDelay = `${this.revealDelay()}ms`;
          el.classList.add('is-revealed');
          this.observer?.unobserve(el);
        }
      },
      // rootMargin âm ở đáy: chỉ kích hoạt khi phần tử vào sâu 12% màn hình,
      // tránh việc nó "hiện" ngay lúc mới ló 1px ở mép dưới.
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    this.observer.observe(el);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
