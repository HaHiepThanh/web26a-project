import {
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { LucideArrowRight, LucideCheck, LucideSparkles, LucideZap } from '@lucide/angular';
import { MagneticDirective } from '../../../directives/magnetic.directive';
import { LineRevealDirective } from '../../../directives/line-reveal.directive';
import { RevealDirective } from '../../../directives/reveal.directive';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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
 * BẢNG NÀY KÉO THẢ ĐƯỢC — nhưng có giới hạn, và giới hạn mới là phần quan trọng.
 *
 * Một bản trước từng cho kéo thả rồi bị gỡ, với lý do đúng: trang giới thiệu
 * phải đẩy người đọc đi xuống, không giữ họ lại nghịch. Lần này giữ nguyên tinh
 * thần đó bằng cách cho ĐÚNG MỘT hành động — dời một tấm thẻ — và bắt nó phục
 * vụ câu quảng cáo ngay phía trên: hero viết "Dragging is saving, there is no
 * Save button", thả tay ra là hiện chữ "Saved". Người đọc vừa tự chứng minh câu
 * đó cho chính mình trong hai giây, rồi đi tiếp.
 *
 * Không thêm thẻ, không sửa chữ, không xoá — những thứ đó mới biến trang thành
 * sân chơi. Ở đây chỉ có một động tác, và nó là chính giá trị cốt lõi.
 *
 * Cấu trúc tấm thẻ bám sát thẻ thật (components/board/card-item) nên nhìn vào là
 * biết sản phẩm ra sao.
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
    LineRevealDirective, RevealDirective,
    MagneticDirective,
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

  /** Tên ba cột — dùng cho nhãn trợ năng và cho câu thông báo khi dời thẻ. */
  readonly columnNames = ['To do', 'In progress', 'Done'];
  readonly cardTitles = ['Finish the demo slides', 'Lock in the brand palette'];

  /** Thẻ đang bị kéo bằng con trỏ (null = không có). */
  readonly dragging = signal<number | null>(null);

  /** Người dùng đã tự dời một thẻ chưa — quyết định dòng chữ gợi ý dưới bảng. */
  readonly moved = signal(false);

  /** Câu thông báo cho trình đọc màn hình sau mỗi lần dời thẻ. */
  readonly announcement = signal('');

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);
  private readonly grid = viewChild<ElementRef<HTMLElement>>('grid');
  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');
  private readonly beatsEl = viewChild<ElementRef<HTMLElement>>('beats');
  private readonly dotsEl = viewChild<ElementRef<HTMLElement>>('dots');
  private readonly savedEl = viewChild<ElementRef<HTMLElement>>('saved');
  private readonly chatEl = viewChild<ElementRef<HTMLElement>>('chat');
  private gsapCtx?: gsap.Context;

  /**
   * Có chạy màn mở ba nhịp hay không.
   *
   * TẮT ở hai trường hợp, và cả hai đều là quyết định thiết kế chứ không phải
   * giới hạn kỹ thuật:
   *
   *  - DƯỚI 900px. Ghim màn hình trên cảm ứng là kiểu giành quyền cuộn khó chịu
   *    nhất: ngón tay vuốt mà trang không đi, người ta tưởng máy treo. Điện
   *    thoại giữ hero như cũ, ba nhịp xếp thẳng thành một đoạn dẫn bình thường.
   *  - GIẢM CHUYỂN ĐỘNG. Ghim hai màn cuộn đúng là loại chuyển động toàn màn
   *    hình mà cài đặt đó sinh ra để dập.
   *
   * Đọc MỘT LẦN lúc dựng chứ không theo dõi tiếp: xoay ngang điện thoại giữa
   * chừng mà bật/tắt ghim thì vị trí cuộn nhảy loạn, tệ hơn nhiều so với việc
   * giữ nguyên chế độ cho tới lần tải sau.
   */
  readonly cinema = signal(false);
  private bloomId = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private liftTimer?: ReturnType<typeof setTimeout>;
  private observer?: IntersectionObserver;
  private running = false;

  /** Người dùng đã chạm vào bảng thì bảng thôi tự diễn, vĩnh viễn. */
  private handedOver = false;
  private dragFrom = { x: 0, y: 0 };

  constructor() {
    afterNextRender(() => {
      // Người đã xin giảm chuyển động thì hai thẻ đứng yên ở chỗ ban đầu.
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduced || typeof IntersectionObserver === 'undefined') return;

      // Quyết định chế độ TRƯỚC, vì template dựng thêm phần tử (chấm tiến độ,
      // huy hiệu Saved, khung chat) chỉ khi ở chế độ điện ảnh — phải có chúng
      // trong DOM rồi mới dựng được timeline.
      this.cinema.set(window.matchMedia('(min-width: 900px)').matches);
      afterNextRender(() => this.buildScrollScene(), { injector: this.injector });

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

  // ==========================================================================
  //  Kéo thả
  // ==========================================================================

  /**
   * Bắt đầu kéo. `setPointerCapture` để mọi sự kiện con trỏ tiếp theo vẫn về
   * đúng tấm thẻ này, kể cả khi ngón tay trượt ra ngoài nó — không có dòng đó
   * thì kéo nhanh một cái là thẻ rớt lại giữa đường.
   */
  onPointerDown(index: number, event: PointerEvent): void {
    // Chuột phải / chuột giữa để yên cho trình duyệt lo.
    if (event.button !== 0) return;
    this.handOver();
    this.dragging.set(index);
    this.dragFrom = { x: event.clientX, y: event.clientY };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    // Chặn hành vi mặc định: trên di động, không chặn thì cả trang cuộn theo ngón tay.
    event.preventDefault();
  }

  onPointerMove(index: number, event: PointerEvent): void {
    if (this.dragging() !== index) return;
    const el = event.currentTarget as HTMLElement;
    // Ghi thẳng vào CSS custom property, không đi qua signal: giá trị đổi theo
    // từng pixel con trỏ, cho nó chạy qua change detection mỗi lần là phí.
    el.style.setProperty('--dx', `${event.clientX - this.dragFrom.x}px`);
    el.style.setProperty('--dy', `${event.clientY - this.dragFrom.y}px`);
  }

  /** Thả tay: tìm ô gần nhất theo vị trí con trỏ rồi cho thẻ đáp vào đó. */
  onPointerUp(index: number, event: PointerEvent): void {
    if (this.dragging() !== index) return;
    const el = event.currentTarget as HTMLElement;
    el.style.removeProperty('--dx');
    el.style.removeProperty('--dy');
    this.dragging.set(null);

    const box = this.grid()?.nativeElement.getBoundingClientRect();
    if (!box) return;

    // Chia lưới thành ba vùng dọc và hai vùng ngang. Cách này thô hơn việc đo
    // đúng từng cột, nhưng lại là thứ người dùng cảm thấy đúng: thả vào đâu thì
    // rơi vào đó, không cần trúng tâm.
    const col = clamp(Math.floor(((event.clientX - box.left) / box.width) * 3), 0, 2);
    const lane = event.clientY - box.top > box.height / 2 ? 1 : 0;
    this.place(index, { col, lane });
  }

  /**
   * Bàn phím: mũi tên dời thẻ đang được chọn.
   *
   * Không làm kiểu "bấm để nhấc, bấm lần nữa để thả" — với một bảng ba cột thì
   * thêm một trạng thái chỉ tổ rối. Mũi tên dời thẳng, mỗi lần một ô.
   */
  onKeydown(index: number, event: KeyboardEvent): void {
    const map: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const delta = map[event.key];
    if (!delta) return;
    event.preventDefault();
    this.handOver();
    const me = this.spots()[index];
    this.place(index, {
      col: clamp(me.col + delta[0], 0, 2),
      lane: clamp(me.lane + delta[1], 0, 1),
    });
  }

  /**
   * Đặt một thẻ vào ô đích. Nếu ô đó đang có thẻ kia thì HAI THẺ ĐỔI CHỖ, chứ
   * không từ chối cú thả — người dùng đã ra hiệu rõ ràng là muốn đưa thẻ tới đó,
   * bật lại là thất hứa với động tác của họ.
   */
  private place(index: number, target: Spot): void {
    const spots = this.spots();
    const me = spots[index];
    if (me.col === target.col && me.lane === target.lane) return;

    const otherIndex = 1 - index;
    const other = spots[otherIndex];
    const swap = other.col === target.col && other.lane === target.lane;

    this.spots.update((list) =>
      list.map((v, i) => (i === index ? target : swap && i === otherIndex ? me : v)),
    );

    this.moved.set(true);
    this.bloom(target.col);
    this.announcement.set(
      `${this.cardTitles[index]} moved to ${this.columnNames[target.col]}. Saved.`,
    );
  }

  /** Nhãn trợ năng của một tấm thẻ, đọc ra vị trí hiện tại và cách dời nó. */
  cardLabel(index: number): string {
    const spot = this.spots()[index];
    return `${this.cardTitles[index]}, in ${this.columnNames[spot.col]}. Use the arrow keys to move it.`;
  }

  /**
   * Người dùng vừa chạm vào bảng: dừng hẳn phần tự diễn.
   *
   * Bảng tự chạy là để MỜI GỌI. Mời được rồi mà vẫn tự dời thẻ thì thành ra
   * giành tay lái với người đang chơi — thẻ tự bay đi trong lúc họ định kéo nó.
   */
  private handOver(): void {
    if (this.handedOver) return;
    this.handedOver = true;
    this.stop();
  }

  private start(): void {
    if (this.running || this.handedOver) return;
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
   * Bảng NGẢ RA SAU VÀ LÙI XA khi người dùng cuộn qua hero.
   *
   * Khác mọi chuyển động còn lại trên trang ở một điểm quyết định: nó CHẠY THEO
   * THANH CUỘN (`scrub`), không diễn một lần rồi thôi. Vị trí của hoạt ảnh CHÍNH
   * LÀ vị trí cuộn — cuộn ngược thì bảng dựng lại. Người dùng điều khiển nó chứ
   * không xem nó, và đó là thứ tạo cảm giác trang "có chiều sâu vật lý" thay vì
   * chỉ có mấy hiệu ứng vào-ra.
   *
   * ⚠️ Bám vào `.board-stage`, KHÔNG bám `.board-frame`. Khung đã mang sẵn một
   * góc nghiêng của CSS; GSAP ghi thẳng vào `transform` nên bám vào đó là xoá
   * mất góc nghiêng ấy. `.board-stage` không có transform nào, và hai transform
   * lồng nhau thì nhân được với nhau.
   *
   * `gsap.context()` gom mọi thứ tạo ra bên trong lại, nên `revert()` lúc huỷ
   * component dọn sạch cả tween lẫn trigger lẫn style đã ghi — không cần nhớ
   * từng cái một.
   */
  private buildScrollScene(): void {
    const hero = this.host.nativeElement as HTMLElement;
    const stage = this.stage()?.nativeElement;
    if (!stage) return;

    gsap.registerPlugin(ScrollTrigger);

    this.gsapCtx = gsap.context(() => {
      if (!this.cinema()) {
        this.recedeOnly(hero, stage);
        return;
      }
      this.cinematicOpen(hero, stage);
    }, hero);

    // Phông tải xong thì mọi thứ cao thấp khác đi, mà cú ghim lại tính mốc theo
    // chiều cao — không đo lại thì điểm nhả ghim lệch đúng bằng phần chênh đó.
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
  }

  /**
   * Đường KHÔNG ghim: bảng chỉ ngả ra sau khi người dùng cuộn qua hero.
   * Dùng cho điện thoại và cho người bật giảm chuyển động.
   */
  private recedeOnly(hero: HTMLElement, stage: HTMLElement): void {
    gsap.to(stage, {
      rotateX: 14,
      scale: 0.9,
      yPercent: -6,
      opacity: 0.72,
      ease: 'none',
      scrollTrigger: { trigger: hero, start: 'bottom bottom', end: 'bottom top', scrub: true },
    });
  }

  /**
   * MÀN MỞ BA NHỊP.
   *
   * Hero ghim lại hai màn cuộn; cuộn tới đâu câu chuyện chạy tới đó, rồi nhả ra
   * và trôi vào phần còn lại của trang. Chạy theo tay cuộn (`scrub`) nên cuộn
   * ngược thì diễn ngược — người xem điều khiển chứ không ngồi xem.
   *
   * ⚠️ MỘT TIMELINE DUY NHẤT, gộp cả cú ngả bảng vốn là một ScrollTrigger
   * riêng. Hai trigger cùng bám một phần tử mà một cái có `pin` thì cái kia đo
   * mốc theo chiều cao đã bị pin-spacer chèn thêm — sai chỗ, và rất khó lần ra.
   * Cú ngả nay nằm ở đoạn cuối timeline: bảng lùi ra xa đúng lúc màn mở khép
   * lại và trang bàn giao cho khu tiếp theo.
   *
   * `ease: 'none'` ở mọi tween: với hoạt ảnh chạy theo cuộn, đường cong làm
   * hình đi nhanh chậm không khớp tay — cảm giác như thanh cuộn bị trượt côn.
   */
  private cinematicOpen(hero: HTMLElement, stage: HTMLElement): void {
    const beats = gsap.utils.toArray<HTMLElement>('.hero-beat', this.beatsEl()?.nativeElement);
    const dots = gsap.utils.toArray<HTMLElement>('span', this.dotsEl()?.nativeElement);
    const saved = this.savedEl()?.nativeElement;
    const chat = this.chatEl()?.nativeElement;
    if (beats.length < 3) return;

    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        // Hai màn cuộn cho ba nhịp. Dài hơn nữa thì người quen lướt nhanh phát
        // cáu; ngắn hơn thì ba nhịp chồng lên nhau đọc không kịp.
        end: '+=200%',
        pin: true,
        scrub: true,
        // Bù trước một nhịp cho cú ghim, nếu không sẽ thấy trang giật một cái ở
        // đúng khoảnh khắc pin bám vào.
        anticipatePin: 1,
      },
    });

    const light = (i: number, at: number) => {
      if (!dots.length) return;
      dots.forEach((d, k) => tl.to(d, { opacity: k === i ? 1 : 0.3, duration: 0.04 }, at));
    };

    // ---- Nhịp 1: tấm bảng vào chỗ ----
    tl.set(beats[1], { opacity: 0, yPercent: 24 })
      .set(beats[2], { opacity: 0, yPercent: 24 })
      .fromTo(stage, { scale: 0.94, yPercent: 4 }, { scale: 1, yPercent: 0, duration: 0.26 }, 0);
    light(0, 0);

    // ---- Nhịp 2: kéo là lưu ----
    tl.to(beats[0], { opacity: 0, yPercent: -24, duration: 0.06 }, 0.28)
      .to(beats[1], { opacity: 1, yPercent: 0, duration: 0.06 }, 0.32);
    light(1, 0.32);
    if (saved) {
      tl.fromTo(
        saved,
        { opacity: 0, scale: 0.8, yPercent: 10 },
        { opacity: 1, scale: 1, yPercent: 0, duration: 0.08 },
        0.38,
      ).to(saved, { opacity: 0, duration: 0.06 }, 0.58);
    }

    // ---- Nhịp 3: trợ lý viết thẻ tiếp theo ----
    tl.to(beats[1], { opacity: 0, yPercent: -24, duration: 0.06 }, 0.6)
      .to(beats[2], { opacity: 1, yPercent: 0, duration: 0.06 }, 0.64);
    light(2, 0.64);
    if (chat) {
      // Bảng nhích sang trái để nhường chỗ cho khung chat, thay vì để khung chat
      // đè lên nó.
      tl.to(stage, { xPercent: -8, duration: 0.1 }, 0.64).fromTo(
        chat,
        { opacity: 0, xPercent: 14 },
        { opacity: 1, xPercent: 0, duration: 0.1 },
        0.68,
      );
    }

    // ---- Khép lại: bảng lùi ra xa, bàn giao cho trang ----
    tl.to(stage, { rotateX: 14, scale: 0.9, yPercent: -6, opacity: 0.72, duration: 0.12 }, 0.88);
    if (chat) tl.to(chat, { opacity: 0, duration: 0.08 }, 0.9);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.stop();
    this.gsapCtx?.revert();
  }
}
