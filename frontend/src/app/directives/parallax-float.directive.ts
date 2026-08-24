import { Directive, ElementRef, OnDestroy, inject, input } from '@angular/core';

/**
 * Phần tử trôi nhẹ theo con trỏ chuột (mouse parallax) — mô phỏng hiệu ứng
 * "Floating" của fancycomponents.dev: vài lớp trang trí ở các "độ sâu" khác
 * nhau, độ sâu càng lớn thì dịch theo chuột càng nhiều, tạo ảo giác chiều sâu.
 *
 * Cách dùng: <div appParallaxFloat [parallaxStrength]="18">
 *
 * Dùng thuộc tính CSS `translate` RIÊNG (qua biến `--parallax-x/-y`), không
 * đụng vào `transform` — nhiều phần tử áp directive này (.floater, .board-frame)
 * đã có sẵn `transform`/`animation` riêng của chúng (bồng bềnh lên xuống, nghiêng
 * phối cảnh...). Gộp chung vào `transform` thì cái ghi sau đè mất cái ghi trước;
 * tách ra hai thuộc tính thì trình duyệt tự cộng dồn cả hai, xem thêm cách
 * `.col-bloom` trong landing-hero.css đã làm y hệt cho lý do y hệt.
 *
 * Nghe `pointermove` trên window (không phải trên chính phần tử) và rAF-throttle,
 * cùng công thức với MagneticDirective — cùng lý do: hiệu ứng phải phản ứng dù
 * chuột đang ở bất cứ đâu trên màn hình, và ghi thẳng vào custom property thay vì
 * signal để khỏi kéo theo change detection mỗi khung hình.
 *
 * Tắt hoàn toàn khi: máy không có con trỏ chính xác (cảm ứng), hoặc người dùng
 * bật "giảm chuyển động".
 */
@Directive({
  selector: '[appParallaxFloat]',
  host: { class: 'is-parallax-float' },
})
export class ParallaxFloatDirective implements OnDestroy {
  /** Độ dịch tối đa của phần tử theo mỗi trục (px) — "độ sâu" của lớp này. */
  readonly parallaxStrength = input(16);

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly el: HTMLElement = this.host.nativeElement;
  private frame = 0;
  private lastEvent?: PointerEvent;
  private attached = false;

  constructor() {
    const finePointer = window.matchMedia?.('(pointer: fine)').matches;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!finePointer || reduced) return;

    this.attached = true;
    window.addEventListener('pointermove', this.onMove, { passive: true });
  }

  private readonly onMove = (event: PointerEvent): void => {
    this.lastEvent = event;
    if (this.frame) return;
    this.frame = requestAnimationFrame(this.paint);
  };

  private readonly paint = (): void => {
    this.frame = 0;
    const event = this.lastEvent;
    if (!event) return;

    // Toạ độ chuẩn hoá quanh TÂM màn hình, mỗi trục nằm trong [-1, 1] — không đo
    // theo vị trí phần tử như MagneticDirective, vì hiệu ứng này mô phỏng chiều
    // sâu của cả một cảnh (mọi lớp cùng phản ứng với một điểm nhìn chung), không
    // phải sức hút cục bộ của riêng từng nút.
    const nx = (event.clientX / window.innerWidth - 0.5) * 2;
    const ny = (event.clientY / window.innerHeight - 0.5) * 2;
    const strength = this.parallaxStrength();

    this.el.style.setProperty('--parallax-x', `${(nx * strength).toFixed(2)}px`);
    this.el.style.setProperty('--parallax-y', `${(ny * strength).toFixed(2)}px`);
  };

  ngOnDestroy(): void {
    if (!this.attached) return;
    if (this.frame) cancelAnimationFrame(this.frame);
    window.removeEventListener('pointermove', this.onMove);
  }
}
