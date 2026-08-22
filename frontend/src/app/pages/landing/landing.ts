import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import {
  LucideActivity,
  LucideArrowRight,
  LucideCheck,
  LucideCircle,
  LucideFolderKanban,
  LucideFolderOpen,
  LucideKanban,
  LucideListChecks,
  LucideMenu,
  LucideMessageSquare,
  LucideMoon,
  LucideMousePointer2,
  LucideShieldCheck,
  LucideSun,
  LucideUsers,
  LucideX,
  LucideZap,
} from '@lucide/angular';

type SyncState = 'live' | 'syncing' | 'updated';
type TaskStage = 'todo' | 'doing' | 'done';
interface Box {
  x: number;
  y: number;
  w: number;
}
interface StageBoundary {
  stage: TaskStage;
  y: number;
}

/**
 * Landing page công khai (marketing) — tách khỏi auth-layout/app-layout vì cần
 * chrome riêng (navbar trong suốt cuộn theo trang, hero full-bleed), không dùng
 * Header/Footer của app (những component đó giả định đã đăng nhập).
 *
 * Concept "One Task, One Journey": một task demo duy nhất ("Thiết kế trang chủ")
 * xuất hiện xuyên suốt trang và đổi trạng thái theo từng section — toàn bộ dữ
 * liệu ở đây là mock cục bộ cho landing page, KHÔNG gọi API thật.
 */
@Component({
  selector: 'app-landing',
  imports: [
    RouterLink,
    LucideActivity,
    LucideArrowRight,
    LucideCheck,
    LucideCircle,
    LucideFolderKanban,
    LucideFolderOpen,
    LucideKanban,
    LucideListChecks,
    LucideMenu,
    LucideMessageSquare,
    LucideMoon,
    LucideMousePointer2,
    LucideShieldCheck,
    LucideSun,
    LucideUsers,
    LucideX,
    LucideZap,
  ],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing implements OnInit, AfterViewInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly title = inject(Title);

  readonly mobileMenuOpen = signal(false);
  readonly scrolled = signal(false);

  /** true nếu user bật "giảm chuyển động" ở OS — tắt mọi animation lặp/tự chạy. */
  private readonly reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Hero: "The Task Begins" — task di chuyển Cần làm → Đang làm ----------
  readonly heroTaskInDoing = signal(false);
  readonly heroCursorActive = signal(false);
  readonly heroCursorAtTarget = signal(false);
  readonly heroColumnHighlight = signal(false);
  readonly heroActivityToast = signal(false);
  readonly heroResetting = signal(false);
  readonly heroSync = signal<SyncState>('live');
  /**
   * Vị trí (px, tương đối .mini-board) của thẻ task đang "sống" — thẻ này LUÔN
   * nằm trong DOM ở một chỗ cố định (position:absolute) và chỉ di chuyển bằng
   * transform giữa 2 toạ độ đo được từ 2 ô placeholder vô hình. Nhờ vậy 2 card
   * thật còn lại trong cột ("Viết API...", "Review pull request...") không bao
   * giờ bị đẩy vị trí — tránh Cumulative Layout Shift thật (đã đo được bằng
   * PerformanceObserver ở bản trước khi sửa: card cũ dùng @if chèn/gỡ DOM giữa
   * 2 cột, gây reflow thật cho card tĩnh bên cạnh).
   */
  readonly heroCardBox = signal<Box>({ x: 0, y: 0, w: 0 });
  private todoBox: Box = { x: 0, y: 0, w: 0 };
  private doingBox: Box = { x: 0, y: 0, w: 0 };
  private resizeRaf = 0;

  /**
   * Toggle giao diện sáng/tối CHỈ cho mockup trong hero — không đổi theme của
   * cả landing page. Trực quan hoá design token sáng/tối có thật trong
   * styles.css ([data-theme='dark']); bản thân app hiện khoá cứng light mode
   * ở ThemeService nên đây là bản demo hệ màu, không phải setting thật.
   */
  readonly heroMockupLight = signal(false);

  toggleHeroMockupTheme(): void {
    this.heroMockupLight.update((v) => !v);
  }

  // ---------- Thanh scroll-progress: "task" đang ở giai đoạn nào của trang ----------
  readonly scrollProgress = signal(0);
  readonly scrollStage = signal<TaskStage>('todo');
  private stageBoundaries: StageBoundary[] = [{ stage: 'todo', y: 0 }];

  // ---------- Product showcase: Checklist Journey của cùng một task ----------
  // 3 item thật (Wireframe/UI Design/Review) — mở đầu bằng auto-play demo,
  // nhưng có thể bấm tay bất kỳ lúc nào: đây là điểm tương tác THẬT duy nhất
  // trên landing page (chỉ đổi state cục bộ, không lưu/gọi API).
  readonly checklistItems = signal<boolean[]>([false, false, false]);
  readonly checklistProgress = computed(() => this.checklistItems().filter(Boolean).length);
  private checklistAutoTimers: number[] = [];

  // ---------- Final CTA: task hoàn thành ----------
  readonly ctaTaskDone = signal(false);

  // ---------- How it works: bước đang active khi cuộn qua section ----------
  readonly activeStep = signal(0);

  private revealObserver: IntersectionObserver | null = null;
  private oneShotObserver: IntersectionObserver | null = null;
  private stepObserver: IntersectionObserver | null = null;
  private stepEls: HTMLElement[] = [];
  private readonly timers: number[] = [];

  ngOnInit(): void {
    this.title.setTitle('HHH — Horizon Hub Harmony');
    // Cuộn mượt khi bấm anchor (#features, #how-it-works). Đặt trên <html> vì
    // style component (Emulated encapsulation) không với ra ngoài host được;
    // trả lại rỗng lúc rời trang để không ảnh hưởng các route khác.
    document.documentElement.style.scrollBehavior = 'smooth';
  }

  ngAfterViewInit(): void {
    const el = this.host.nativeElement;

    // Scroll-reveal nhẹ bằng IntersectionObserver — không kéo thêm thư viện.
    // Mỗi phần tử .reveal chỉ chạy animation một lần rồi ngừng quan sát.
    const revealItems: NodeListOf<HTMLElement> = el.querySelectorAll(
      '.reveal, .reveal-scale, .reveal-stagger',
    );
    this.revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('in-view');
          this.revealObserver?.unobserve(entry.target);
        }
      },
      { threshold: 0.15 },
    );
    revealItems.forEach((item) => this.revealObserver?.observe(item));

    // Đo vị trí 2 ô placeholder (Cần làm / Đang làm) trước khi bắt đầu loop, để
    // thẻ task nổi luôn khớp vị trí thật ngay từ khung hình đầu tiên.
    this.measureHeroSlots();

    // Đo mốc scroll cho thanh progress (Cần làm/Đang làm/Hoàn thành) rồi tính
    // ngay trạng thái ban đầu (vd. khi user reload giữa trang, không phải luôn ở đầu).
    this.measureStageBoundaries();
    this.updateScrollProgress();

    // Hero: bắt đầu vòng lặp demo khi board mockup lọt vào viewport.
    const heroVisual = el.querySelector('.hero-visual');
    if (heroVisual) {
      const heroObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            this.measureHeroSlots();
            this.runHeroCycle();
            heroObserver.disconnect();
          }
        },
        { threshold: 0.3 },
      );
      heroObserver.observe(heroVisual);
    }

    // Checklist Journey (card detail trong Product Showcase) — chạy một lần.
    const checklistEl = el.querySelector('.checklist-journey');
    const ctaEl = el.querySelector('.cta-task-card');
    this.oneShotObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (entry.target === checklistEl) this.runChecklistJourney();
          if (entry.target === ctaEl) this.runCtaCompletion();
          this.oneShotObserver?.unobserve(entry.target);
        }
      },
      { threshold: 0.4 },
    );
    if (checklistEl) this.oneShotObserver.observe(checklistEl);
    if (ctaEl) this.oneShotObserver.observe(ctaEl);

    // How it works: highlight bước gần tâm viewport nhất khi cuộn qua. Dùng
    // "closest to center" thay vì một dải mỏng ở giữa — dải mỏng bị nhảy cóc
    // qua khi user cuộn nhanh (wheel flick, Page Down), khiến activeStep kẹt
    // ở bước cũ. Cách này luôn đúng bất kể cuộn nhanh hay chậm.
    const stepNodes: NodeListOf<HTMLElement> = el.querySelectorAll('[data-step-index]');
    this.stepEls = Array.from(stepNodes);
    if (this.stepEls.length) {
      this.stepObserver = new IntersectionObserver(() => this.updateActiveStep(), {
        threshold: [0, 0.25, 0.5, 0.75, 1],
      });
      this.stepEls.forEach((step) => this.stepObserver?.observe(step));
    }
  }

  ngOnDestroy(): void {
    document.documentElement.style.scrollBehavior = '';
    document.body.style.overflow = '';
    this.revealObserver?.disconnect();
    this.oneShotObserver?.disconnect();
    this.stepObserver?.disconnect();
    this.timers.forEach((id) => clearTimeout(id));
    if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.scrolled.set(window.scrollY > 8);
    this.updateScrollProgress();
  }

  // Đo lại vị trí 2 ô placeholder + mốc scroll-progress khi resize (debounce
  // bằng rAF) — vd. khi mini-board chuyển từ 3 cột sang xếp chồng 1 cột ở
  // <640px, hoặc chiều cao trang đổi do nội dung reflow.
  @HostListener('window:resize')
  onResize(): void {
    if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
    this.resizeRaf = requestAnimationFrame(() => {
      this.measureHeroSlots();
      this.measureStageBoundaries();
      this.updateScrollProgress();
    });
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.mobileMenuOpen()) this.closeMobileMenu();
  }

  // Đóng menu di động khi click ra ngoài .nav — burger + link bên trong .nav
  // đều nằm trong .nav nên không bị đóng nhầm khi bấm chính chúng.
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.mobileMenuOpen()) return;
    const navEl = this.host.nativeElement.querySelector('.nav');
    if (navEl && !navEl.contains(event.target as Node)) {
      this.closeMobileMenu();
    }
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((v) => !v);
    this.syncBodyScrollLock();
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
    this.syncBodyScrollLock();
  }

  /** Khoá scroll nền khi menu di động đang mở, để tránh trạng thái "nửa mở nửa cuộn". */
  private syncBodyScrollLock(): void {
    document.body.style.overflow = this.mobileMenuOpen() ? 'hidden' : '';
  }

  /** Chọn step có tâm gần tâm viewport nhất làm step đang active. */
  private updateActiveStep(): void {
    if (!this.stepEls.length) return;
    const viewportCenter = window.innerHeight / 2;
    let closestIdx = 0;
    let closestDist = Infinity;
    this.stepEls.forEach((stepEl, i) => {
      const rect = stepEl.getBoundingClientRect();
      const dist = Math.abs(rect.top + rect.height / 2 - viewportCenter);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    });
    this.activeStep.set(closestIdx);
  }

  /**
   * Đo 2 ô placeholder ẩn (.mini-card-slot-todo / .mini-card-slot-doing) so
   * với .mini-board, rồi đồng bộ heroCardBox theo trạng thái hiện tại. Cả 2 ô
   * này luôn tồn tại trong DOM (visibility:hidden) nên card thật bên cạnh
   * không bao giờ đổi vị trí — chỉ thẻ task nổi (position:absolute) di chuyển.
   */
  private measureHeroSlots(): void {
    const el = this.host.nativeElement;
    const board = el.querySelector('.mini-board') as HTMLElement | null;
    const todoSlot = el.querySelector('.mini-card-slot-todo') as HTMLElement | null;
    const doingSlot = el.querySelector('.mini-card-slot-doing') as HTMLElement | null;
    if (!board || !todoSlot || !doingSlot) return;
    const boardRect = board.getBoundingClientRect();
    const t = todoSlot.getBoundingClientRect();
    const d = doingSlot.getBoundingClientRect();
    this.todoBox = { x: t.left - boardRect.left, y: t.top - boardRect.top, w: t.width };
    this.doingBox = { x: d.left - boardRect.left, y: d.top - boardRect.top, w: d.width };
    this.syncHeroCardBox();
  }

  private syncHeroCardBox(): void {
    this.heroCardBox.set(this.heroTaskInDoing() ? this.doingBox : this.todoBox);
  }

  /**
   * Đo mốc scroll cho 3 giai đoạn "Cần làm → Đang làm → Hoàn thành": todo kết
   * thúc khi #showcase bắt đầu, doing kết thúc khi .final-cta bắt đầu. Đo một
   * lần (+ khi resize) rồi chỉ so sánh số trong onScroll — không đọc DOM mỗi
   * lần cuộn để tránh forced reflow.
   */
  private measureStageBoundaries(): void {
    const el = this.host.nativeElement;
    const showcase = el.querySelector('#showcase') as HTMLElement | null;
    const finalCta = el.querySelector('.final-cta') as HTMLElement | null;
    const boundaries: StageBoundary[] = [{ stage: 'todo', y: 0 }];
    if (showcase) {
      boundaries.push({ stage: 'doing', y: showcase.getBoundingClientRect().top + window.scrollY });
    }
    if (finalCta) {
      boundaries.push({ stage: 'done', y: finalCta.getBoundingClientRect().top + window.scrollY });
    }
    this.stageBoundaries = boundaries;
  }

  private updateScrollProgress(): void {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const progress = max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 0;
    this.scrollProgress.set(progress);

    // Chuyển giai đoạn sớm hơn ~35% chiều cao viewport so với mốc thật, để
    // cảm giác "đã bước sang phần mới" tự nhiên hơn là đúng lúc chạm viền trên.
    const earlyBy = window.innerHeight * 0.35;
    let stage: TaskStage = 'todo';
    for (const boundary of this.stageBoundaries) {
      if (window.scrollY >= boundary.y - earlyBy) stage = boundary.stage;
    }
    this.scrollStage.set(stage);
  }

  /** Lên lịch một callback và ghi lại id để dọn dẹp ở ngOnDestroy. */
  private after(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  /**
   * Vòng lặp demo Hero: cursor giả xuất hiện → task được "kéo" sang Đang làm →
   * cột nhận task highlight nhẹ → activity toast → đồng bộ realtime chip →
   * board mờ nhẹ để reset → lặp lại. Tự tắt vòng lặp nếu reduced-motion.
   */
  private runHeroCycle(): void {
    if (this.reducedMotion) {
      // Giữ trạng thái tĩnh cuối cùng — task đã ở Đang làm, không lặp.
      this.heroTaskInDoing.set(true);
      this.heroSync.set('live');
      this.syncHeroCardBox();
      return;
    }

    this.heroTaskInDoing.set(false);
    this.heroCursorActive.set(false);
    this.heroCursorAtTarget.set(false);
    this.heroColumnHighlight.set(false);
    this.heroActivityToast.set(false);
    this.heroResetting.set(false);
    this.heroSync.set('live');
    this.syncHeroCardBox();

    this.after(1600, () => this.heroCursorActive.set(true));
    this.after(2400, () => {
      this.heroCursorAtTarget.set(true);
      this.heroSync.set('syncing');
    });
    this.after(3000, () => {
      this.heroTaskInDoing.set(true);
      this.heroColumnHighlight.set(true);
      this.syncHeroCardBox();
    });
    this.after(3100, () => this.heroCursorActive.set(false));
    this.after(3400, () => {
      this.heroActivityToast.set(true);
      this.heroSync.set('updated');
    });
    this.after(4700, () => this.heroSync.set('live'));
    this.after(5600, () => {
      this.heroActivityToast.set(false);
      this.heroColumnHighlight.set(false);
    });
    this.after(6600, () => this.heroResetting.set(true));
    this.after(7000, () => {
      this.heroTaskInDoing.set(false);
      this.heroCursorAtTarget.set(false);
      this.syncHeroCardBox();
    });
    this.after(7300, () => this.heroResetting.set(false));
    this.after(8600, () => this.runHeroCycle());
  }

  /** Checklist Journey trong card detail của Product Showcase — demo tự chạy một lần. */
  private runChecklistJourney(): void {
    if (this.reducedMotion) {
      this.checklistItems.set([true, true, true]);
      return;
    }
    const tickItem = (index: number) => {
      this.checklistItems.update((items) => items.map((v, i) => (i === index ? true : v)));
    };
    this.scheduleChecklistAuto(500, () => tickItem(0));
    this.scheduleChecklistAuto(1500, () => tickItem(1));
    this.scheduleChecklistAuto(2500, () => tickItem(2));
  }

  /** Lên lịch một bước của demo tự chạy — riêng để có thể huỷ khi user bấm tay. */
  private scheduleChecklistAuto(ms: number, fn: () => void): void {
    const id = window.setTimeout(fn, ms);
    this.timers.push(id);
    this.checklistAutoTimers.push(id);
  }

  /**
   * Bấm tay 1 ô checklist trong Product Showcase — điểm tương tác THẬT duy
   * nhất trên trang, không lưu/gọi API. Bấm lần đầu sẽ huỷ luôn phần demo tự
   * chạy còn lại, để không bị ghi đè ngược lại lựa chọn của user.
   */
  toggleChecklistItem(index: number): void {
    this.checklistAutoTimers.forEach((id) => clearTimeout(id));
    this.checklistAutoTimers = [];
    this.checklistItems.update((items) => items.map((v, i) => (i === index ? !v : v)));
  }

  /** Final CTA: task chuyển từ "Đang làm" sang "Hoàn thành" — chạy một lần. */
  private runCtaCompletion(): void {
    if (this.reducedMotion) {
      this.ctaTaskDone.set(true);
      return;
    }
    this.after(900, () => this.ctaTaskDone.set(true));
  }
}
