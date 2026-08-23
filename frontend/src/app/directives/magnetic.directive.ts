import { Directive, ElementRef, OnDestroy, inject, input } from '@angular/core';

/**
 * Nút "có từ tính": khi con trỏ tới gần, nút dịch nhẹ về phía con trỏ rồi bật
 * lại chỗ cũ khi chuột đi xa.
 *
 * Nghe `pointermove` trên window chứ không trên chính nút, vì hiệu ứng phải bắt
 * đầu TRƯỚC khi chuột chạm vào nút — đó mới là "hút". Một listener thụ động cho
 * mỗi nút từ tính (trang này có 2) là chi phí chấp nhận được; listener chỉ ghi
 * thẳng vào custom property, không chạm signal nào, nên không kéo theo một vòng
 * change detection nào.
 *
 * Biên độ cố ý nhỏ (mặc định 10px): đủ để cảm nhận là nút "sống", chưa đủ để
 * thành trò đùa làm người dùng bấm trượt. Nút vẫn nằm dưới con trỏ khi bấm.
 *
 * Tắt hoàn toàn khi: máy không có con trỏ chính xác (cảm ứng), hoặc người dùng
 * bật "giảm chuyển động".
 */
@Directive({
  selector: '[appMagnetic]',
  host: { class: 'is-magnetic' },
})
export class MagneticDirective implements OnDestroy {
  /** Bán kính vùng hút, tính từ mép nút ra ngoài (px). */
  readonly magneticRadius = input(120);
  /** Độ dịch tối đa của nút (px). */
  readonly magneticStrength = input(10);

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

    const box = this.el.getBoundingClientRect();
    // Nút đã bị dịch đi rồi, nên tâm đo được là tâm ở vị trí hiện tại. Không sao:
    // độ dịch nhỏ hơn nhiều so với bán kính hút nên vòng lặp vẫn hội tụ, không rung.
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;

    // Khoảng cách tính từ MÉP nút, không phải từ tâm — nút to nút nhỏ đều có
    // vùng hút dày như nhau.
    const edgeX = Math.max(0, Math.abs(dx) - box.width / 2);
    const edgeY = Math.max(0, Math.abs(dy) - box.height / 2);
    const distance = Math.hypot(edgeX, edgeY);
    const radius = this.magneticRadius();

    if (distance > radius) {
      this.el.style.setProperty('--magnet-x', '0px');
      this.el.style.setProperty('--magnet-y', '0px');
      return;
    }

    // Càng gần càng hút mạnh, và bình phương cho nó "mềm" ở rìa vùng hút thay vì
    // giật một cái khi vừa cắt ngưỡng.
    const pull = (1 - distance / radius) ** 2 * this.magneticStrength();
    const length = Math.hypot(dx, dy) || 1;
    this.el.style.setProperty('--magnet-x', `${((dx / length) * pull).toFixed(2)}px`);
    this.el.style.setProperty('--magnet-y', `${((dy / length) * pull).toFixed(2)}px`);
  };

  ngOnDestroy(): void {
    if (!this.attached) return;
    if (this.frame) cancelAnimationFrame(this.frame);
    window.removeEventListener('pointermove', this.onMove);
  }
}
