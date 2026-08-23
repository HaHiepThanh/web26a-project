import { Directive, ElementRef, OnDestroy, inject } from '@angular/core';

/**
 * Đèn rọi bám con trỏ: ghi toạ độ chuột (tương đối với phần tử) vào hai custom
 * property `--mx` / `--my`. Phần vẽ để CSS lo bằng `radial-gradient` — xem
 * `.bento-card::before` trong landing-features.css.
 *
 * Vì sao ghi thẳng vào style thay vì đi qua signal + binding: giá trị đổi theo
 * từng pixel chuột, mỗi lần cho chạy qua change detection của Angular là một
 * vòng kiểm tra vô ích cho toàn cây component. Ở đây chỉ cần trình duyệt vẽ lại.
 *
 * Hai lớp phòng hộ hiệu năng:
 *  1. Gộp về tối đa 1 lần ghi mỗi khung hình bằng requestAnimationFrame; chuột
 *     bắn sự kiện dày hơn tốc độ màn hình vẽ, ghi hết là phí.
 *  2. Không gắn gì trên thiết bị cảm ứng (`pointer: coarse`) — không có con trỏ
 *     thì không có gì để bám theo.
 *
 * Cố ý KHÔNG tắt theo `prefers-reduced-motion`, khác với các hiệu ứng còn lại
 * của trang: quầng sáng này không tự chuyển động, nó đứng yên đúng chỗ con trỏ
 * — tức là phản hồi trực tiếp cho thao tác của chính người dùng, không phải thứ
 * nhúc nhích ngoài ý muốn gây chóng mặt. Phần DUY NHẤT có thể coi là hoạt ảnh
 * là lúc quầng sáng mờ vào/mờ ra, và transition đó đã bị tắt trong khối
 * prefers-reduced-motion của landing-features.css.
 */
@Directive({
  selector: '[appSpotlight]',
  host: { class: 'has-spotlight' },
})
export class SpotlightDirective implements OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);

  private readonly el: HTMLElement = this.host.nativeElement;
  private frame = 0;
  private lastEvent?: MouseEvent;
  private attached = false;

  constructor() {
    if (!window.matchMedia?.('(pointer: fine)').matches) return;

    this.attached = true;
    this.el.addEventListener('pointermove', this.onMove, { passive: true });
    this.el.addEventListener('pointerleave', this.onLeave, { passive: true });
  }

  private readonly onMove = (event: MouseEvent): void => {
    this.lastEvent = event;
    if (this.frame) return;
    this.frame = requestAnimationFrame(this.paint);
  };

  private readonly paint = (): void => {
    this.frame = 0;
    const event = this.lastEvent;
    if (!event) return;
    // Đọc kích thước rồi ghi style ngay trong cùng một khung hình: thứ tự
    // đọc-trước-ghi-sau tránh việc trình duyệt phải tính lại layout giữa chừng.
    const box = this.el.getBoundingClientRect();
    this.el.style.setProperty('--mx', `${event.clientX - box.left}px`);
    this.el.style.setProperty('--my', `${event.clientY - box.top}px`);
    this.el.style.setProperty('--spot', '1');
  };

  private readonly onLeave = (): void => {
    this.el.style.setProperty('--spot', '0');
  };

  ngOnDestroy(): void {
    if (!this.attached) return;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerleave', this.onLeave);
  }
}
