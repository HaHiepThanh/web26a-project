import { Directive, ElementRef, OnDestroy, afterNextRender, inject } from '@angular/core';

/** Con nào muốn được animate phải mang thuộc tính này, giá trị là id ổn định. */
const ATTR = 'data-flip-id';

const THOI_LUONG_MS = 300;
/** Dịch dưới ngưỡng này coi như không nhúc nhích — tránh animate vì sai số làm tròn. */
const NGUONG_PX = 1.5;

/**
 * Animate khi các phần tử con ĐỔI CHỖ cho nhau (kỹ thuật FLIP).
 *
 * Vì sao phải có: `transition` của CSS không animate được việc sắp xếp lại. Khi
 * `@for` đảo thứ tự, trình duyệt chỉ việc dời node sang vị trí mới — không có
 * thuộc tính nào biến thiên để mà nội suy, nên thẻ "nhảy" tức thì. Người dùng
 * bật bộ lọc thấy cả list giật một cái rồi đứng im, không hiểu vừa xảy ra gì.
 *
 * FLIP = First → Last → Invert → Play:
 *   First   ghi vị trí cũ (bản đồ `truoc`, đo ở lần chạy trước)
 *   Last    DOM đã dời xong, đo vị trí mới
 *   Invert  đẩy ngược phần tử về CHỖ CŨ bằng `translate` — mắt thấy nó chưa đi đâu
 *   Play    cho `translate` chạy về 0, thành ra nó trượt từ chỗ cũ tới chỗ mới
 *
 * Dùng MutationObserver thay vì đo ở mỗi chu kỳ kiểm tra: `getBoundingClientRect`
 * ép trình duyệt tính lại bố cục, gọi nó cho vài chục thẻ ở MỌI vòng change
 * detection là một nguồn giật lag tự tạo. Đảo thứ tự thì `@for` phải dời node
 * thật, mà dời node là một mutation `childList` — nên chỉ cần đo đúng lúc đó.
 */
@Directive({
  selector: '[appFlipReorder]',
})
export class FlipReorder implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private truoc = new Map<string, DOMRect>();
  private theo?: MutationObserver;
  private dangCho = false;

  constructor() {
    afterNextRender(() => {
      // Chụp mốc đầu tiên TRƯỚC khi theo dõi, nếu không lần đảo đầu tiên sẽ
      // không có gì để so và bị bỏ qua.
      this.truoc = this.doViTri();
      this.theo = new MutationObserver(() => this.henChay());
      this.theo.observe(this.host.nativeElement, { childList: true });
    });
  }

  ngOnDestroy(): void {
    this.theo?.disconnect();
  }

  /**
   * Gộp nhiều mutation liên tiếp vào một lần chạy.
   *
   * Đảo chỗ một danh sách sinh ra hàng loạt mutation rời rạc (mỗi node dời là
   * một cái). Chạy ngay ở cái đầu tiên là đo giữa chừng, lúc DOM mới dời được
   * một nửa. `requestAnimationFrame` đẩy phần đo xuống sau khi cả loạt đã xong.
   */
  private henChay(): void {
    if (this.dangCho) return;
    this.dangCho = true;
    requestAnimationFrame(() => {
      this.dangCho = false;
      this.chay();
    });
  }

  private doViTri(): Map<string, DOMRect> {
    const map = new Map<string, DOMRect>();
    for (const el of this.host.nativeElement.querySelectorAll<HTMLElement>(`[${ATTR}]`)) {
      const id = el.getAttribute(ATTR);
      if (id) map.set(id, el.getBoundingClientRect());
    }
    return map;
  }

  private chay(): void {
    // Web Animations API vắng mặt ở môi trường không phải trình duyệt thật
    // (jsdom khi chạy test). Thiếu nó thì bỏ hiệu ứng, KHÔNG được ném lỗi —
    // animation là thứ trang trí, không đáng làm vỡ cả trang board.
    if (typeof this.host.nativeElement.animate !== 'function') return;

    const sau = this.doViTri();

    for (const el of this.host.nativeElement.querySelectorAll<HTMLElement>(`[${ATTR}]`)) {
      const id = el.getAttribute(ATTR);
      if (!id) continue;
      const cu = this.truoc.get(id);
      const moi = sau.get(id);
      // Không có vị trí cũ = thẻ vừa được thêm vào. Nó không "đổi chỗ" nên
      // không trượt đi đâu cả — để yên, đỡ một chuyển động vô nghĩa.
      if (!cu || !moi) continue;

      const dx = cu.left - moi.left;
      const dy = cu.top - moi.top;
      if (Math.abs(dx) < NGUONG_PX && Math.abs(dy) < NGUONG_PX) continue;

      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        {
          duration: THOI_LUONG_MS,
          // Bung nhanh rồi hãm dần: mắt bắt được hướng đi ngay từ đầu.
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          // `composite: 'replace'` mặc định sẽ ĐÈ luôn transform mà CDK đang đặt
          // lên thẻ khi kéo-thả. Cộng dồn thay vì đè, để hai thứ không giành nhau.
          composite: 'add',
        },
      );
    }

    this.truoc = sau;
  }
}
