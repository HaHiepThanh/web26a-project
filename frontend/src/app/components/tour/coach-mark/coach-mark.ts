import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { LucideLightbulb, LucideX } from '@lucide/angular';
import { TourStore } from '../../../ngrx/tour/tour.store';

const GAP = 10;
const W = 280;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Bong bóng chỉ dẫn nhỏ, hiện đúng một lần, ngay tại chỗ tính năng nằm.
 *
 * Cố ý KHÁC hẳn lớp phủ tour, và mỗi khác biệt là một luật trong đặc tả §3.3:
 *
 *  - Không làm mờ gì cả. Người dùng đang làm việc dở, không phải đang học.
 *  - Không chặn chuột (`pointer-events: none` ở lớp bọc). Bấm ra ngoài là đóng,
 *    và cú bấm đó vẫn tới được thứ họ định bấm — không nuốt mất thao tác.
 *  - Một câu, một nút. Dài hơn là thành bài giảng chen ngang.
 */
@Component({
  selector: 'app-coach-mark',
  imports: [LucideLightbulb, LucideX],
  templateUrl: './coach-mark.html',
  styleUrl: './coach-mark.css',
})
export class CoachMark {
  private readonly tour = inject(TourStore);
  private readonly bubble = viewChild<ElementRef<HTMLElement>>('bubble');

  readonly mark = this.tour.coachMark;
  private readonly anchorRect = signal<Rect | null>(null);
  private readonly bubbleH = signal(72);

  readonly visible = computed(() => this.mark() !== null && this.anchorRect() !== null);

  /** Đặt dưới neo, lật lên trên khi chạm đáy, kẹp vào trong màn hình. */
  readonly pos = computed(() => {
    const r = this.anchorRect();
    if (!r) return { top: 0, left: 0 };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(W, vw - 24);
    const bh = this.bubbleH();
    const duoi = r.top + r.height + GAP;
    const top = duoi + bh > vh - 12 ? Math.max(12, r.top - GAP - bh) : duoi;
    const raw = r.left + r.width / 2 - w / 2;
    return { top, left: Math.min(Math.max(12, raw), Math.max(12, vw - w - 12)) };
  });

  private dungTheoDoi: (() => void) | null = null;

  constructor() {
    effect(() => {
      const m = this.mark();
      this.dungTheoDoi?.();
      this.dungTheoDoi = null;
      this.anchorRect.set(null);
      if (m) this.bamTheoNeo(m.anchor);
    });

    effect(() => {
      if (!this.visible()) return;
      // Bong bóng đã hiện thật — giờ mới tính là phiên này đã nói một câu.
      this.tour.confirmCoachMarkShown();
      queueMicrotask(() => {
        const el = this.bubble()?.nativeElement;
        if (el) this.bubbleH.set(el.offsetHeight);
      });
    });

    // Bấm bất kỳ đâu ngoài bong bóng = đã đọc. Nghe ở pha bắt (capture) và KHÔNG
    // chặn sự kiện: cú bấm vẫn chạy tiếp tới thứ họ định bấm.
    const onDown = (e: MouseEvent) => {
      if (!this.mark()) return;
      const el = this.bubble()?.nativeElement;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      this.tour.dismissCoachMark();
    };
    document.addEventListener('pointerdown', onDown, true);

    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('pointerdown', onDown, true);
      this.dungTheoDoi?.();
    });
  }

  /**
   * Bám khung của neo bằng vòng lặp theo khung hình.
   *
   * Cùng lý do như lớp phủ tour: sự kiện `scroll`/`resize` bỏ sót mọi thứ khác
   * làm dịch bố cục. Neo biến mất thì xoá khung, bong bóng tự ẩn — chỉ dẫn treo
   * lơ lửng cạnh chỗ trống còn khó hiểu hơn là không có.
   */
  private bamTheoNeo(name: string): void {
    const selector = `[data-tour="${name}"]`;
    let raf = 0;
    let truoc: Rect | null = null;

    const doi = (a: Rect | null, b: Rect | null) =>
      !a || !b || a.top !== b.top || a.left !== b.left || a.width !== b.width || a.height !== b.height;

    const tick = () => {
      const el = document.querySelector<HTMLElement>(selector);
      const r = el?.getBoundingClientRect();
      const dungDuoc =
        !!el &&
        !!r &&
        (r.width > 0 || r.height > 0) &&
        r.bottom > 0 &&
        r.top < window.innerHeight;

      if (!dungDuoc) {
        if (truoc !== null) {
          truoc = null;
          this.anchorRect.set(null);
        }
      } else {
        const sau: Rect = { top: r.top, left: r.left, width: r.width, height: r.height };
        if (doi(truoc, sau)) {
          truoc = sau;
          this.anchorRect.set(sau);
        }
      }
      raf = requestAnimationFrame(tick);
    };

    tick();

    // Neo không xuất hiện trong 2 giây thì BỎ mẩu này đi, và bỏ mà không ghi
    // nhớ — người dùng chưa từng nhìn thấy nó. Giữ mãi một mẩu treo lơ lửng thì
    // suất duy nhất của phiên bị khoá cứng, ba mẩu còn lại im lặng theo.
    const hetGio = setTimeout(() => {
      if (!this.anchorRect()) this.tour.dropCoachMark();
    }, 2000);

    this.dungTheoDoi = () => {
      cancelAnimationFrame(raf);
      clearTimeout(hetGio);
    };
  }

  onGotIt(): void {
    this.tour.dismissCoachMark();
  }
}
