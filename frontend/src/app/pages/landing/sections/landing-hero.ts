import { Component, ElementRef, OnDestroy, afterNextRender, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideArrowRight, LucideCheck, LucideSparkles, LucideZap } from '@lucide/angular';
import { MagneticDirective } from '../../../directives/magnetic.directive';
import { ParallaxFloatDirective } from '../../../directives/parallax-float.directive';
import { RevealDirective } from '../../../directives/reveal.directive';
import { ScrambleInDirective } from '../../../directives/scramble-in.directive';

/** Một chỗ đáp: cột nào (0–2) và làn nào (0 = trên, 1 = dưới). */
interface Spot {
  col: number;
  lane: number;
}

/** Khoảng nghỉ giữa hai lần dời thẻ (ms) — bốc ngẫu nhiên trong quãng này. */
const PAUSE_MIN = 2200;
const PAUSE_MAX = 4200;

/**
 * Khu vực mở đầu: câu chào + một bảng Kanban thu nhỏ tự diễn.
 *
 * Bảng dựng bằng HTML/CSS thật chứ không phải ảnh chụp màn hình: ảnh sẽ mờ trên
 * màn hình mật độ cao, không đổi được theo theme sáng/tối, và không kể được câu
 * chuyện "việc chảy từ trái sang phải" bằng chuyển động.
 *
 * Hai thẻ du hành KÉO-THẢ được bằng tay (xem onTravellerPointerDown) — bản
 * trước từng bỏ tương tác này đi vì lo giữ chân người đọc lại nghịch thay vì
 * cuộn tiếp xuống dưới; giờ đánh đổi ngược lại có chủ đích: "dragging is
 * saving" là câu mở đầu của trang, để người đọc THỬ được luôn ngay ở đây thì
 * thuyết phục hơn là chỉ đọc chữ. Ba tấm thẻ còn lại (đứng yên trong mỗi cột)
 * vẫn chỉ để ngắm — không nằm trong hệ 6 ô nên không kéo được, giữ vai trò
 * mỏ neo thị giác cho mỗi cột. Cấu trúc tấm thẻ vẫn bám sát thẻ thật
 * (components/board/card-item) nên nhìn vào là biết sản phẩm ra sao.
 *
 * PHÂN CÔNG GIỮA JS VÀ CSS — phần đáng chú ý nhất ở đây:
 *
 *   JS chỉ làm ĐẠO DIỄN: vài giây một lần, bốc ngẫu nhiên xem dời thẻ nào, tới
 *   chỗ nào, rồi ghi hai con số vào `--col` / `--lane`.
 *   CSS làm DIỄN VIÊN: `transition` trên transform lo toàn bộ quãng bay.
 *
 * Nghĩa là luồng chính chỉ thức dậy khoảng 3 giây một lần chứ không phải mỗi
 * khung hình — quãng bay vẫn chạy trên luồng hợp thành y như khi dùng keyframes
 * thuần. Bản trước dùng keyframes cố định nên đường đi lặp y hệt sau mỗi 18
 * giây; xem một vòng là biết hết. Ngẫu nhiên thì không bao giờ lặp lại.
 */
@Component({
  selector: 'app-landing-hero',
  imports: [
    RouterLink,
    RevealDirective,
    MagneticDirective,
    ParallaxFloatDirective,
    ScrambleInDirective,
    LucideArrowRight,
    LucideCheck,
    LucideSparkles,
    LucideZap,
  ],
  templateUrl: './landing-hero.html',
  styleUrls: ['../_landing-shared.css', './landing-hero.css'],
})
export class LandingHero implements OnDestroy {
  readonly trust = ['Free for small teams', 'Sign in with Google', 'Nothing to install'];

  /** Chỗ đứng hiện tại của hai tấm thẻ du hành. */
  readonly spots = signal<Spot[]>([
    { col: 0, lane: 0 },
    { col: 1, lane: 1 },
  ]);

  /** Thẻ nào đang bay — dùng để nhấc nó lên trong lúc di chuyển. */
  readonly moving = signal<number | null>(null);

  /**
   * Những vệt loé đang cháy. Mỗi lần một tấm thẻ đáp xuống thì cột đó loé lên
   * một quầng sáng rồi tắt dần.
   *
   * Vì sao là MẢNG có id chứ không phải một cờ bật/tắt: hoạt ảnh CSS chỉ chạy
   * lại khi phần tử được dựng mới. Giữ một phần tử rồi bật tắt class thì lần loé
   * thứ hai không chạy nữa nếu lần đầu chưa tắt xong. Mỗi lần loé là một phần tử
   * riêng, cháy hết thì tự bị gỡ.
   */
  readonly blooms = signal<{ id: number; col: number }[]>([]);

  /** Thẻ đang bị NGƯỜI DÙNG cầm kéo (khác với `moving`, vốn là lúc TỰ bay). */
  readonly dragging = signal<number | null>(null);

  private readonly host = inject(ElementRef<HTMLElement>);
  private bloomId = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private liftTimer?: ReturnType<typeof setTimeout>;
  private observer?: IntersectionObserver;
  private running = false;

  // ---- Kéo-thả bằng tay ----
  private dragEl: HTMLElement | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  /** Chụp sẵn 6 ô lúc bắt đầu kéo — đỡ phải querySelectorAll lại mỗi lần di chuột. */
  private dragSlots: HTMLElement[] = [];
  private hoveredSlotEl: HTMLElement | null = null;

  constructor() {
    afterNextRender(() => {
      // Người đã xin giảm chuyển động thì hai thẻ đứng yên ở chỗ ban đầu.
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduced || typeof IntersectionObserver === 'undefined') return;

      // Chỉ diễn khi bảng còn trong khung nhìn. Người đã cuộn xuống tận chân
      // trang thì không có lý do gì để một cái hẹn giờ vẫn chạy ở trên đầu.
      this.observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) this.start();
            else this.stop();
          }
        },
        { threshold: 0.12 },
      );
      this.observer.observe(this.host.nativeElement as HTMLElement);
    });
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule();
  }

  private stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.liftTimer) clearTimeout(this.liftTimer);
    this.timer = undefined;
    this.liftTimer = undefined;
    this.moving.set(null);
    this.blooms.set([]);
  }

  private schedule(): void {
    const wait = PAUSE_MIN + Math.random() * (PAUSE_MAX - PAUSE_MIN);
    this.timer = setTimeout(() => {
      if (!this.running) return;
      this.moveOne();
      this.schedule();
    }, wait);
  }

  /**
   * Bốc một thẻ và một chỗ trống rồi dời sang đó.
   *
   * Chỗ đến được chọn trong sáu ô (3 cột × 2 làn), trừ đi ô thẻ đó đang đứng và
   * ô thẻ kia đang chiếm — hai thẻ chồng lên nhau thì trông như lỗi hiển thị.
   *
   * Nghiêng về phía trước chứ không ngẫu nhiên đều: bảng công việc thì việc chảy
   * sang phải là chính, thi thoảng mới có thứ bị mở lại.
   *
   * Lưu ý cách đo cho đúng: SỐ LẦN đi tới và đi lùi gần như bằng nhau, và không
   * cách nào khác được — hai tấm thẻ trong ba cột là một hệ kín, mỗi bước sang
   * phải sớm muộn phải có một bước sang trái bù lại, nếu không thẻ dồn hết vào
   * cột cuối rồi đứng im. Thứ trọng số thật sự điều khiển là THỜI GIAN thẻ nằm
   * ở đâu: đo 3000 lượt cho ra 19% / 27% / 54% cho ba cột, tức là mắt người xem
   * thấy thẻ đọng ở phía "xong" nhiều gấp ba phía "cần làm". Đó mới là cảm giác
   * việc đang chảy.
   */
  private moveOne(): void {
    // Người dùng đang tự cầm một thẻ — không để bộ đếm giờ giành tay giữa
    // chừng. Về lý thuyết `stop()` lúc bắt đầu kéo đã huỷ hẹn giờ này rồi, cờ
    // ở đây chỉ là lớp phòng hộ thứ hai cho trường hợp hiếm: IntersectionObserver
    // bắn `start()` đúng lúc đang kéo (cuộn trang trong khi tay vẫn giữ chuột).
    if (this.dragging() !== null) return;

    const spots = this.spots();

    // Ưu tiên nhấc tấm đang nằm bên TRÁI. Không có bước này thì dòng chảy đứng
    // im tại chỗ: thẻ đã tới cột cuối chỉ còn nước lùi lại, nên nếu bốc đều tay
    // thì số lần đi lùi gần bằng số lần đi tới và cả bảng trông như hai tấm thẻ
    // nảy qua nảy lại chứ không như việc đang chảy sang phải.
    let who: number;
    if (spots[0].col === spots[1].col) who = Math.random() < 0.5 ? 0 : 1;
    else {
      const leftmost = spots[0].col < spots[1].col ? 0 : 1;
      who = Math.random() < 0.75 ? leftmost : 1 - leftmost;
    }

    const me = spots[who];
    const other = spots[1 - who];

    const candidates: Spot[] = [];
    for (let col = 0; col < 3; col++) {
      for (let lane = 0; lane < 2; lane++) {
        if (col === me.col && lane === me.lane) continue;
        if (col === other.col && lane === other.lane) continue;
        // Đi tới được ưu ái gấp sáu lần đi lùi.
        const weight = col > me.col ? 6 : col === me.col ? 2 : 1;
        for (let i = 0; i < weight; i++) candidates.push({ col, lane });
      }
    }
    if (!candidates.length) return;

    const target = candidates[Math.floor(Math.random() * candidates.length)];
    this.spots.update((s) => s.map((v, i) => (i === who ? target : v)));

    // Nhấc thẻ lên trong đúng quãng bay. 900ms khớp với transition trong CSS —
    // đổi một chỗ thì phải đổi chỗ kia.
    this.moving.set(who);
    if (this.liftTimer) clearTimeout(this.liftTimer);
    this.liftTimer = setTimeout(() => {
      this.moving.set(null);
      this.bloom(target.col);
    }, 900);
  }

  /**
   * Loé sáng ở cột vừa nhận thẻ.
   *
   * Nền của một trang giới thiệu thường chỉ là đồ trang trí, chẳng liên quan gì
   * tới nội dung. Ở đây nó phản ứng lại đúng thứ đang diễn ra trên bảng — thẻ
   * đáp xuống đâu thì chỗ đó sáng lên. Chi tiết nhỏ, nhưng nó biến hai lớp rời
   * rạc thành một cảnh duy nhất.
   */
  private bloom(col: number): void {
    const id = this.bloomId++;
    this.blooms.update((list) => [...list, { id, col }]);
    // Dọn sau khi quầng sáng cháy hết, nếu không mảng cứ dài mãi.
    setTimeout(() => {
      this.blooms.update((list) => list.filter((b) => b.id !== id));
    }, 1400);
  }

  /**
   * Bắt đầu kéo một thẻ du hành bằng tay.
   *
   * `setPointerCapture` ghim mọi sự kiện pointer tiếp theo vào đúng phần tử này
   * cho tới khi thả ra — không cần lo chuột đi lố ra ngoài rìa thẻ giữa chừng
   * (chuyện thường gặp khi kéo nhanh) làm rớt mất sự kiện move/up.
   */
  onTravellerPointerDown(event: PointerEvent, index: number): void {
    // Chuột phải/giữa không phải để kéo. Cảm ứng/bút không có `button` phân
    // biệt theo cách đó nên bỏ qua điều kiện này.
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const el = event.currentTarget as HTMLElement;
    el.setPointerCapture(event.pointerId);

    this.dragging.set(index);
    this.dragEl = el;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragSlots = Array.from(
      (this.host.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.slot[data-col]'),
    );

    // Đang cầm tay thì bộ đếm giờ tự dời thẻ phải nhường sân — dùng lại đúng
    // stop() của vòng tự diễn, nó vốn đã huỷ hẹn giờ mà không đụng tới `spots`.
    this.stop();

    // Không có bước này thì trình duyệt cố kéo cả trang trên cảm ứng, hoặc bôi
    // đen chữ trên desktop — cả hai đều không phải điều người dùng muốn khi kéo thẻ.
    event.preventDefault();
  }

  onTravellerPointerMove(event: PointerEvent): void {
    if (this.dragging() === null || !this.dragEl) return;

    const dx = event.clientX - this.dragStartX;
    const dy = event.clientY - this.dragStartY;
    this.dragEl.style.setProperty('--drag-x', `${dx}px`);
    this.dragEl.style.setProperty('--drag-y', `${dy}px`);

    this.updateHoveredSlot(event.clientX, event.clientY);
  }

  /** Chung cho cả `pointerup` (thả bình thường) lẫn `pointercancel` (hệ điều
   *  hành cướp mất cử chỉ giữa chừng, ví dụ vuốt xuống mở thanh thông báo). */
  onTravellerPointerEnd(event: PointerEvent): void {
    const index = this.dragging();
    const el = this.dragEl;
    if (index === null || !el) return;

    // Bỏ transition:none của .is-dragging TRƯỚC khi đổi --col/--lane/--drag-*
    // bên dưới, để quãng "buông tay rồi trượt vào đúng ô" được easing lo, y hệt
    // cảm giác của quãng bay tự động.
    this.dragging.set(null);

    const target = this.hoveredSlotEl
      ? { col: Number(this.hoveredSlotEl.dataset['col']), lane: Number(this.hoveredSlotEl.dataset['lane']) }
      : this.spots()[index];
    this.dropAt(index, target);

    el.style.setProperty('--drag-x', '0px');
    el.style.setProperty('--drag-y', '0px');
    if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);

    this.clearHoverHighlight();
    this.dragEl = null;
    this.dragSlots = [];

    // Nhả tay xong thì trả lại quyền cho bộ đếm giờ tự diễn — board lại "sống"
    // như trước khi người dùng chạm vào, chỉ là giờ đứng ở chỗ họ vừa đặt xuống.
    this.start();
  }

  /**
   * Đặt thẻ `index` vào ô `target`.
   *
   * Nếu ô đó đang bị thẻ KIA chiếm thì hai thẻ đổi chỗ cho nhau thay vì chồng
   * lên nhau — giống cảm giác thả một thẻ thật vào chỗ đã có thẻ khác trong
   * app: thẻ cũ nhường chỗ chứ không biến mất.
   */
  private dropAt(index: number, target: Spot): void {
    const current = this.spots();
    const otherIndex = index === 0 ? 1 : 0;
    const other = current[otherIndex];

    const next = [...current];
    if (other.col === target.col && other.lane === target.lane) {
      next[otherIndex] = current[index];
    }
    next[index] = target;
    this.spots.set(next);

    this.bloom(target.col);
  }

  /** Ô đang gần con trỏ nhất trong lúc kéo — so khoảng cách tới TÂM từng ô chứ
   *  không đòi con trỏ phải nằm lọt hẳn trong ô, để khi thả tay ngay trên tấm
   *  thẻ đứng yên (đứng giữa hai ô) vẫn chọn được đúng ô gần hơn theo cảm giác. */
  private updateHoveredSlot(x: number, y: number): void {
    let nearest: HTMLElement | null = null;
    let nearestDist = Infinity;
    for (const slot of this.dragSlots) {
      const box = slot.getBoundingClientRect();
      const dist = Math.hypot(x - (box.left + box.width / 2), y - (box.top + box.height / 2));
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = slot;
      }
    }
    if (nearest === this.hoveredSlotEl) return;
    this.hoveredSlotEl?.classList.remove('is-drag-over');
    nearest?.classList.add('is-drag-over');
    this.hoveredSlotEl = nearest;
  }

  private clearHoverHighlight(): void {
    this.hoveredSlotEl?.classList.remove('is-drag-over');
    this.hoveredSlotEl = null;
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.stop();
  }
}
