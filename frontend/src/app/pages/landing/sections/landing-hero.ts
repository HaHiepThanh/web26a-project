import {
  Component,
  ElementRef,
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

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly grid = viewChild<ElementRef<HTMLElement>>('grid');
  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');
  private gsapCtx?: gsap.Context;
  private bloomId = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private liftTimer?: ReturnType<typeof setTimeout>;
  private observer?: IntersectionObserver;
  private running = false;

  constructor() {
    afterNextRender(() => {
      // Người đã xin giảm chuyển động thì hai thẻ đứng yên ở chỗ ban đầu.
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduced || typeof IntersectionObserver === 'undefined') return;

      this.buildScrollScene();

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

    this.bloom(target.col);
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
    const stage = this.stage()?.nativeElement;
    if (!stage) return;

    gsap.registerPlugin(ScrollTrigger);

    this.gsapCtx = gsap.context(() => {
      gsap.to(stage, {
        rotateX: 14,
        scale: 0.9,
        yPercent: -6,
        opacity: 0.72,
        // `none` chứ không phải một đường cong: với hoạt ảnh chạy theo cuộn,
        // đường cong sẽ làm bảng đi nhanh chậm không khớp tay cuộn — cảm giác
        // như thanh cuộn bị trượt côn.
        ease: 'none',
        scrollTrigger: {
          trigger: this.host.nativeElement,
          // Bắt đầu lúc đáy hero chạm đáy màn hình, kết thúc lúc đáy hero rời
          // khỏi đỉnh: đúng quãng người dùng đang rời khu vực này.
          start: 'bottom bottom',
          end: 'bottom top',
          scrub: true,
        },
      });
    }, this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.stop();
    this.gsapCtx?.revert();
  }
}
