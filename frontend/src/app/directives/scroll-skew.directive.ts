import { Directive, ElementRef, OnDestroy, afterNextRender, inject, input } from '@angular/core';
import gsap from 'gsap';
import { getScrollVelocity } from '../pages/landing/scroll-velocity';

/**
 * Khối nghiêng và giãn theo TỐC ĐỘ cuộn: cuộn nhanh thì nó ngả theo chiều
 * cuộn, dừng tay thì đàn về thẳng.
 *
 * Cách dùng: <div class="deck" appScrollSkew> hoặc [skewAmount]="0.05".
 *
 * VÌ SAO LÀ HIỆU ỨNG NÀY. Mọi chuyển động khác trên trang đều diễn MỘT LẦN rồi
 * thôi — lướt nhanh là lỡ, cuộn lại thì không diễn nữa. Cái này thì có mặt ở
 * từng nhịp cuộn và phản hồi theo chính tay người dùng, nên nó là thứ duy nhất
 * không thể không nhận ra. Đúng loại chuyển động mà một trang "sống" cần.
 *
 * ⚠️ CHỈ GẮN VÀO KHỐI BỌC, đừng gắn vào phần tử đã có transform của riêng nó.
 * GSAP ghi thẳng vào `transform`, nên gắn lên `.tcard` (vốn có
 * `transform: translateY(-4px)` lúc rê chuột) là hai bên giành nhau một thuộc
 * tính và cú rê chuột mất tác dụng. Gắn lên khối bọc thì hai transform LỒNG
 * nhau — nhân được với nhau, không đè nhau.
 *
 * Vì sao dùng `gsap.quickTo` chứ không tự nội suy: nó dựng sẵn một tween tái sử
 * dụng và chỉ đổi giá trị đích mỗi khung hình, nên không sinh rác cho bộ thu
 * gom mỗi lần cuộn. Đây đúng là việc GSAP làm tốt nhất — và tiện thể dùng tới
 * thư viện vốn đã nằm trong gói mà chưa chạy một tween nào.
 */
@Directive({
  selector: '[appScrollSkew]',
})
export class ScrollSkewDirective implements OnDestroy {
  /**
   * Độ nghiêng tối đa, tính bằng độ. Giữ NHỎ: quá 4 độ là chữ bắt đầu khó đọc
   * và hiệu ứng lộ ra thành trò, thay vì cảm giác khối có quán tính.
   */
  readonly skewMax = input(2);

  /** Bao nhiêu độ trên mỗi pixel-mỗi-khung của vận tốc. */
  readonly skewPerPx = input(0.03);

  private readonly host = inject(ElementRef<HTMLElement>);
  private ticker?: () => void;
  private applied = 0;

  constructor() {
    afterNextRender(() => {
      const el = this.host.nativeElement as HTMLElement;

      // Nghiêng cả khối theo tay cuộn đúng là loại chuyển động toàn màn hình mà
      // cài đặt giảm chuyển động sinh ra để dập.
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

      const setSkew = gsap.quickTo(el, 'skewY', {
        // 0.28s, KHÔNG phải 0.45s.
        // Người dùng báo khu "Four cards" có cảm giác lag, và đo ra thì không
        // phải rớt khung — 16.7ms mỗi khung, không khung nào quá 20ms, y hệt
        // các khu không có hiệu ứng. Thủ phạm là ĐỘ TRỄ ĐUỔI THEO: ngừng cuộn
        // rồi khối vẫn còn nghiêng 0.86 độ và gần một giây sau mới thẳng lại.
        // Một khối lớn còn đang ngả trong khi tay đã dừng thì mắt đọc ra đúng
        // là "trang không theo kịp" — dù đồng hồ nói ngược lại.
        duration: 0.28,
        ease: 'power3.out',
      });

      this.ticker = () => {
        const v = getScrollVelocity();
        const max = this.skewMax();
        const next = Math.max(-max, Math.min(max, v * this.skewPerPx()));

        // Bỏ qua khi thay đổi quá nhỏ để mắt thấy. Không có chốt này thì mỗi
        // khung hình đều ghi một giá trị mới và trình duyệt phải hợp thành lại
        // cả lớp, kể cả lúc trang đứng yên.
        if (Math.abs(next - this.applied) < 0.01) return;
        this.applied = next;
        setSkew(next);
      };

      gsap.ticker.add(this.ticker);
    });
  }

  ngOnDestroy(): void {
    if (this.ticker) gsap.ticker.remove(this.ticker);
    // Xoá hẳn transform GSAP đã ghi. Không dọn thì phần tử giữ nguyên góc
    // nghiêng của khoảnh khắc rời trang.
    gsap.set(this.host.nativeElement, { clearProps: 'transform' });
  }
}
