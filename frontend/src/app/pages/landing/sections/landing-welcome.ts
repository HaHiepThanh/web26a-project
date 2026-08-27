import { Component, ElementRef, OnDestroy, afterNextRender, inject, viewChild } from '@angular/core';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Màn chào — khu vực đầu tiên, cao đúng một màn hình.
 *
 * KHÔNG PHẢI CỔNG CHẶN. Không đếm ngược, không thanh tiến trình giả, không giữ
 * ai lại: cuộn một cái là qua, y như mọi khu vực khác. Điều đó quan trọng ở
 * đúng sản phẩm này, vì cả trang đang bán một lời hứa là "không có gì phải
 * chờ" — một cái cổng bắt đợi sẽ tự cãi lại chính nó ngay trong hai giây đầu.
 *
 * CÁCH NÓ RỜI ĐI: khu vực này `position: sticky` và nằm DƯỚI mọi thứ khác. Nó
 * đứng yên trong khi hero trôi lên ĐÈ PHỦ lên trên — cảm giác điện ảnh của một
 * tấm màn được kéo qua, nhưng trang vẫn đi đúng theo tay người dùng, không một
 * mili giây nào bị giữ lại. Phần chữ bên trong còn trôi chậm hơn một chút và mờ
 * dần, nên lúc hero phủ kín thì nó đã tắt hẳn.
 *
 * Vì nó nằm im ở đó suốt phần còn lại của trang (đã trong suốt hoàn toàn), cả
 * khu vực mang `pointer-events: none` — một tấm phủ vô hình mà ăn mất cú bấm
 * thì là lỗi tệ nhất có thể có ở đây. Mũi tên "Scroll" cũng chỉ là hình trang
 * trí, không phải liên kết, nên không có gì cần bấm.
 *
 * HIỆN MỌI LẦN VÀO TRANG, không nhớ đã xem hay chưa. Lý do là kỹ thuật: lúc có
 * lúc không thì chiều cao tài liệu khác nhau giữa các lần vào, kéo theo mọi mốc
 * `#features`, `#try-it` rơi lệch chỗ và việc trình duyệt khôi phục vị trí cuộn
 * sau F5 thả người ta vào một chỗ vô nghĩa. Đổi lại chỉ tiết kiệm cho người
 * quay lại đúng một cú lướt — không đáng.
 */
@Component({
  selector: 'app-landing-welcome',
  templateUrl: './landing-welcome.html',
  styleUrls: ['../_landing-shared.css', './landing-welcome.css'],
})
export class LandingWelcome implements OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly inner = viewChild<ElementRef<HTMLElement>>('inner');
  private ctx?: gsap.Context;

  constructor() {
    afterNextRender(() => {
      const el = this.host.nativeElement as HTMLElement;
      const inner = this.inner()?.nativeElement;
      if (!inner) return;

      // Giảm chuyển động: bỏ phần trôi chậm và mờ dần. Khu vực vẫn nằm im dưới
      // đáy và hero vẫn phủ lên — đó là bố cục, không phải hoạt ảnh.
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

      gsap.registerPlugin(ScrollTrigger);

      this.ctx = gsap.context(() => {
        gsap.to(inner, {
          // Trôi chậm hơn trang: phần chữ tụt lại 14% chiều cao của chính nó
          // trong lúc cuộn, nên mắt đọc ra là hai lớp ở hai độ sâu khác nhau.
          // Nhỏ thôi — quá tay thì chữ trôi ra khỏi khung và bị cắt cụt.
          yPercent: 14,
          opacity: 0,
          scale: 0.97,
          // `none` chứ không phải đường cong: hoạt ảnh chạy theo cuộn mà có
          // đường cong thì hình đi nhanh chậm không khớp tay, cảm giác trượt côn.
          ease: 'none',
          scrollTrigger: {
            trigger: el,
            start: 'top top',
            // Tắt hẳn khi mới đi được 70% màn hình, KHÔNG kéo tới cuối: phải
            // trong suốt xong trước lúc hero phủ kín, không thì có một quãng
            // ngắn thấy chữ mờ mờ nằm sau mép trên của hero.
            end: '70% top',
            scrub: true,
          },
        });
      }, el);
    });
  }

  ngOnDestroy(): void {
    this.ctx?.revert();
  }
}
