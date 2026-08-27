import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/** Nghĩa của từng chữ, hiện ra khi con trỏ đi ngang chữ H tương ứng. */
const MEANINGS = [
  'The far line a team keeps walking toward.',
  'The one place everything meets.',
  'Many people at once, nobody stepping on anyone.',
];

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
 * ⚠️ HỆ QUẢ CỦA `pointer-events: none`: khu vực này KHÔNG nhận được sự kiện con
 * trỏ nào, nên `:hover` của CSS vô dụng ở đây. Cả hai thứ tương tác bên dưới
 * (thẻ bám con trỏ, ba chữ H phản ứng) đều phải nghe `pointermove` trên
 * `window` rồi tự tính xem con trỏ đang ở đâu.
 *
 * HIỆN MỌI LẦN VÀO TRANG, không nhớ đã xem hay chưa. Lý do là kỹ thuật: lúc có
 * lúc không thì chiều cao tài liệu khác nhau giữa các lần vào, kéo theo mọi mốc
 * `#features`, `#try-it` rơi lệch chỗ và việc trình duyệt khôi phục vị trí cuộn
 * sau F5 thả người ta vào một chỗ vô nghĩa.
 */
@Component({
  selector: 'app-landing-welcome',
  templateUrl: './landing-welcome.html',
  styleUrls: ['../_landing-shared.css', './landing-welcome.css'],
})
export class LandingWelcome implements OnDestroy {
  readonly meanings = MEANINGS;

  /** Chữ H con trỏ đang đi ngang (0–2), hoặc null. */
  readonly hovered = signal<number | null>(null);

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly inner = viewChild<ElementRef<HTMLElement>>('inner');
  private readonly cursorCard = viewChild<ElementRef<HTMLElement>>('cursorCard');
  private readonly glyphs = viewChildren<ElementRef<HTMLElement>>('glyph');
  private ctx?: gsap.Context;
  private onMove?: (e: PointerEvent) => void;

  constructor() {
    afterNextRender(() => {
      const el = this.host.nativeElement as HTMLElement;
      const inner = this.inner()?.nativeElement;
      if (!inner) return;

      // Giảm chuyển động: bỏ phần trôi chậm, bỏ luôn thẻ bám con trỏ. Khu vực
      // vẫn nằm im dưới đáy và hero vẫn phủ lên — đó là bố cục, không phải
      // hoạt ảnh.
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

      this.trackPointer(el);
    });
  }

  /**
   * Thẻ bám theo con trỏ + ba chữ H phản ứng khi con trỏ đi ngang.
   *
   * CHỈ TRÊN THIẾT BỊ CÓ CON TRỎ CHÍNH XÁC. Trên cảm ứng thì không có khái niệm
   * "con trỏ đang ở đâu": thẻ sẽ đứng im ở chỗ chạm cuối cùng, còn nghĩa của
   * chữ H thì không cách nào gọi ra. Thà không có còn hơn có mà hỏng.
   *
   * Nghe trên `window` chứ không trên khu vực, vì khu vực mang
   * `pointer-events: none` nên không nhận được sự kiện nào — xem ghi chú đầu
   * lớp. Bù lại phải tự kiểm tra con trỏ có đang nằm trong khung không.
   */
  private trackPointer(el: HTMLElement): void {
    if (!window.matchMedia?.('(pointer: fine)').matches) return;

    const card = this.cursorCard()?.nativeElement;
    if (!card) return;

    // `quickTo` dựng sẵn một tween tái dùng và chỉ đổi giá trị đích mỗi lần —
    // không sinh rác cho bộ thu gom ở mỗi cú rê chuột.
    const toX = gsap.quickTo(card, 'x', { duration: 0.55, ease: 'power3' });
    const toY = gsap.quickTo(card, 'y', { duration: 0.55, ease: 'power3' });
    // Nghiêng chậm hơn dịch chuyển: thẻ ngả theo hướng đi rồi mới từ từ về
    // thẳng, đúng cảm giác một vật có khối lượng đang được cầm.
    const toRotate = gsap.quickTo(card, 'rotate', { duration: 0.9, ease: 'power3' });
    const toOpacity = gsap.quickTo(card, 'opacity', { duration: 0.3, ease: 'power2' });

    let lastX = 0;

    const innerEl = this.inner()?.nativeElement;

    this.onMove = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();

      // Ẩn khi con trỏ ra khỏi khung, HOẶC khi đã cuộn qua màn chào. Không có vế
      // sau thì tấm thẻ vẫn lơ lửng trên các khu vực phía dưới — khu vực này
      // `sticky` nên nó nằm đó suốt cả trang.
      const inside =
        e.clientY >= box.top && e.clientY <= box.bottom && window.scrollY < window.innerHeight * 0.5;

      if (!inside) {
        toOpacity(0);
        this.hovered.set(null);
        return;
      }

      // TRÁNH ĐƯỜNG KHI CON TRỎ VÀO VÙNG CHỮ.
      // Một tấm thẻ bám theo con trỏ thì sớm muộn cũng đi ngang cái tên — và
      // nhìn thấy thật: nó che mất chữ "Hub" giữa "Horizon Hub Harmony". Thứ
      // trang trí sinh ra để lấp chỗ trống thì phải nhường chỗ cho chữ, chứ
      // không được che chữ. Nới 24px mỗi phía để nó mờ đi TRƯỚC khi chạm tới,
      // không phải mờ đúng lúc đã chồng lên.
      const ir = innerEl?.getBoundingClientRect();
      const overText =
        !!ir &&
        e.clientX > ir.left - 24 &&
        e.clientX < ir.right + 24 &&
        e.clientY > ir.top - 24 &&
        e.clientY < ir.bottom + 24;

      toOpacity(overText ? 0 : 1);

      toX(e.clientX - box.left);
      toY(e.clientY - box.top);
      toRotate(gsap.utils.clamp(-14, 14, (e.clientX - lastX) * 0.8));
      lastX = e.clientX;

      this.hovered.set(this.glyphUnder(e.clientX, e.clientY));
    };

    window.addEventListener('pointermove', this.onMove, { passive: true });
  }

  /**
   * Chữ H nào đang nằm dưới con trỏ.
   *
   * Nới vùng nhận ra 14px mỗi phía: chữ H là ba nét mảnh, đòi trúng đúng nét
   * thì gần như không ai chạm được, và cả hiệu ứng thành ra chỉ thỉnh thoảng
   * mới chớp lên — người dùng sẽ tưởng nó lỗi chứ không nghĩ là mình trượt.
   */
  private glyphUnder(x: number, y: number): number | null {
    const pad = 14;
    const list = this.glyphs();
    for (let i = 0; i < list.length; i++) {
      const r = list[i].nativeElement.getBoundingClientRect();
      if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) {
        return i;
      }
    }
    return null;
  }

  ngOnDestroy(): void {
    if (this.onMove) window.removeEventListener('pointermove', this.onMove);
    this.ctx?.revert();
  }
}
