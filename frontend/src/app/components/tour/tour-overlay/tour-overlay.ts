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
import { Router } from '@angular/router';
import { LucideArrowLeft, LucideArrowRight, LucideX } from '@lucide/angular';
import { TourStore } from '../../../ngrx/tour/tour.store';
import { TOUR_STEPS, TourStep } from '../../../ngrx/tour/tour.steps';

/** Khoảng hở giữa vùng soi sáng và mép phần tử thật, tính bằng px. */
const HALO = 8;
/** Khoảng cách từ vùng soi sáng tới popover. */
const GAP = 14;
const POPOVER_W = 320;
/** Quá thời gian này mà không thấy neo trong DOM thì bỏ qua bước, không treo. */
const ANCHOR_TIMEOUT_MS = 3000;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Lớp phủ của tour: làm mờ xung quanh, chừa sáng đúng phần tử đang dạy, và đặt
 * popover cạnh nó.
 *
 * Render MỘT LẦN ở `app-layout` — tour đi xuyên route nên đặt trong trang là mất
 * khi điều hướng.
 *
 * Vì sao bốn hình chữ nhật bao quanh chứ không một lớp phủ có `clip-path` khoét
 * lỗ: lỗ khoét bằng clip-path vẫn là một phần tử phủ kín màn hình, chuột bấm vào
 * "lỗ" vẫn trúng nó chứ không trúng cái nút bên dưới. Mà cả tầng 1 dựa vào việc
 * người dùng BẤM ĐƯỢC cái nút đang được soi. Bốn hình bao quanh để lại một khoảng
 * trống thật sự — không có gì nằm trên cái nút cả.
 *
 * Vì sao tự tính vị trí thay vì CDK Overlay như đặc tả nêu: popover và bốn mảng
 * mờ phải nằm chung một hệ toạ độ thì lỗ sáng mới khớp popover. CDK Overlay dựng
 * popover trong một container riêng ngoài cây component, nên sẽ phải đồng bộ hai
 * hệ toạ độ mỗi khung hình. Không thêm thư viện nào — đúng tinh thần của đặc tả.
 */
@Component({
  selector: 'app-tour-overlay',
  imports: [LucideArrowLeft, LucideArrowRight, LucideX],
  templateUrl: './tour-overlay.html',
  styleUrl: './tour-overlay.css',
})
export class TourOverlay {
  private readonly tour = inject(TourStore);
  private readonly router = inject(Router);
  private readonly popover = viewChild<ElementRef<HTMLElement>>('popover');

  readonly step = this.tour.currentStep;
  readonly stepNumber = computed(() => this.tour.stepIndex() + 1);
  /** Lấy từ store vì con số này đổi theo chế độ: "basics" là 4, đầy đủ là 7. */
  readonly totalSteps = this.tour.totalSteps;
  readonly canGoBack = computed(() => this.tour.stepIndex() > 0);

  /** Khung của phần tử đang được soi, toạ độ theo viewport (khớp position:fixed). */
  private readonly anchorRect = signal<Rect | null>(null);

  /** Chiều cao thật của popover, đo sau khi render để lật lên/xuống cho đúng. */
  private readonly popoverH = signal(180);

  /** Có modal nào của app đang mở không (daisyUI đánh dấu bằng `.modal-open`). */
  private readonly modalOpen = signal(false);

  /**
   * Tour lùi lại hoàn toàn khi modal mở.
   *
   * Bấm "New Workspace" là modal hiện ra ở `z-[1000]`, còn lớp phủ tour ở 9000 —
   * tour nằm ĐÈ LÊN modal và làm mờ chính cái bảng người dùng vừa mở để điền,
   * phải tắt tour mới hết mờ. Hạ z-index không cứu được: lớp mờ chui xuống dưới
   * modal thì vẫn còn vệt tối phủ phần trang xung quanh, trông như lỗi render.
   *
   * Đúng ra là ẩn hẳn: modal CHÍNH LÀ việc tour vừa bảo họ làm, không cần soi
   * sáng thêm gì nữa. Modal đóng lại thì lớp phủ tự hiện lại trên cái nút cũ;
   * còn nếu họ tạo xong thật thì dữ liệu về và tour đã sang bước sau rồi.
   */
  readonly visible = computed(
    () => this.step() !== null && this.anchorRect() !== null && !this.modalOpen(),
  );

  /** Vùng sáng = khung phần tử nới ra HALO mỗi phía. */
  readonly hole = computed<Rect | null>(() => {
    const r = this.anchorRect();
    if (!r) return null;
    return {
      top: r.top - HALO,
      left: r.left - HALO,
      width: r.width + HALO * 2,
      height: r.height + HALO * 2,
    };
  });

  /** Vị trí popover: ưu tiên bên dưới, không đủ chỗ thì lật lên trên. */
  readonly popoverPos = computed(() => {
    const h = this.hole();
    if (!h) return { top: 0, left: 0 };
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const below = h.top + h.height + GAP;
    const ph = this.popoverH();
    const flipUp = below + ph > vh - 12;
    const top = flipUp ? Math.max(12, h.top - GAP - ph) : below;
    // Căn giữa theo neo rồi kẹp vào trong màn hình — neo sát mép phải mà không
    // kẹp thì popover tràn ra ngoài và người dùng mất luôn nút Next.
    const raw = h.left + h.width / 2 - POPOVER_W / 2;
    const left = Math.min(Math.max(12, raw), Math.max(12, vw - POPOVER_W - 12));
    return { top, left };
  });

  private cleanupAnchor: (() => void) | null = null;

  constructor() {
    // Bám theo bước hiện tại: mỗi lần đổi bước thì đi tìm neo mới.
    effect(() => {
      const step = this.step();
      this.cleanupAnchor?.();
      this.cleanupAnchor = null;
      this.anchorRect.set(null);
      if (step) this.trackAnchor(step.anchor, step.page, step.waitMs ?? ANCHOR_TIMEOUT_MS);
    });

    // Đo popover sau khi nó có nội dung — cần chiều cao thật mới lật đúng.
    effect(() => {
      if (!this.visible()) return;
      queueMicrotask(() => {
        const el = this.popover()?.nativeElement;
        if (el) this.popoverH.set(el.offsetHeight);
      });
    });

    const onKey = (e: KeyboardEvent) => this.onKeydown(e);
    window.addEventListener('keydown', onKey);

    // Theo dõi modal của app. Quan sát cả `childList` lẫn thuộc tính `class`:
    // có modal được thêm/bớt khỏi DOM (`@if (isOpen())`), có modal luôn nằm đó
    // và chỉ bật tắt lớp `.modal-open`. Thiếu một trong hai là bỏ sót một nửa.
    const syncModal = () =>
      this.modalOpen.set(document.querySelector('.modal-open') !== null);
    const modalObserver = new MutationObserver(syncModal);
    modalObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    syncModal();

    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('keydown', onKey);
      modalObserver.disconnect();
      this.cleanupAnchor?.();
    });
  }

  /**
   * Tìm phần tử `[data-tour="..."]` và bám theo khung của nó.
   *
   * Neo có thể chưa có trong DOM: modal đang mở dở, dữ liệu đang tải, hoặc trang
   * board còn đang điều hướng tới. Chờ bằng MutationObserver; quá 3 giây thì bỏ
   * qua bước đó và đi tiếp — tour tự tin rằng DOM đã sẵn sàng là tour sẽ treo
   * trên máy mạng chậm, và màn hình mờ không có popover nào là bế tắc hoàn toàn.
   */
  private trackAnchor(name: string, page: TourStep['page'], waitMs: number): void {
    const selector = `[data-tour="${name}"]`;
    let raf = 0;
    let observer: MutationObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let el: HTMLElement | null = null;

    /**
     * Phần tử có thật sự dùng được không — CÓ TRONG DOM là chưa đủ.
     *
     * Cả hai nút neo bước 1 và bước 2 đều mang `[class.hidden]="!canManage()"`,
     * tức thành viên thường vẫn có phần tử trong DOM nhưng `display:none`, khung
     * đo ra 0×0. Nếu coi thế là "đã tìm thấy" thì ta gỡ MutationObserver và huỷ
     * đồng hồ đếm ngược, rồi ngồi chờ mãi một khung không bao giờ tới: tour treo
     * cứng, không popover, không lối thoát nào ngoài Esc.
     */
    const isUsable = (node: HTMLElement | null): node is HTMLElement => {
      if (!node || !node.isConnected) return false;
      const r = node.getBoundingClientRect();
      return r.width > 0 || r.height > 0;
    };

    const measure = () => {
      if (!isUsable(el)) return;
      const r = el.getBoundingClientRect();
      this.anchorRect.set({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    const onScrollOrResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };

    const attach = (found: HTMLElement) => {
      el = found;
      observer?.disconnect();
      observer = null;
      if (timer) clearTimeout(timer);
      timer = null;
      found.scrollIntoView({ block: 'center', behavior: 'smooth' });
      measure();
      // Cuộn mượt mất vài trăm ms; đo lại vài nhịp để lỗ sáng đuổi kịp.
      requestAnimationFrame(measure);
      setTimeout(measure, 180);
      setTimeout(measure, 420);
      window.addEventListener('scroll', onScrollOrResize, true);
      window.addEventListener('resize', onScrollOrResize);
    };

    /**
     * Chỉ bấm giờ bỏ-qua-bước khi ĐÃ Ở ĐÚNG TRANG của bước đó.
     *
     * Bước 3 và 4 nằm ở trang Board. Sau khi tạo board xong, app điều hướng sang
     * `/board/:id` rồi mới nạp cột và thẻ — chuỗi đó dễ vượt 3 giây trên mạng
     * chậm. Bấm giờ ngay từ lúc còn ở trang workspace thì bước 3 hết giờ, nhảy
     * sang bước 4; mà neo bước 4 (`add-card`) chỉ tồn tại BÊN TRONG một cột, chưa
     * có cột nào nên nó cũng hết giờ nốt. Tour "chạy" xong hai bước trong 6 giây
     * mà không dạy được gì, người dùng chỉ thấy màn hình chớp rồi hết.
     */
    const onRightPage = () => {
      const url = this.router.url;
      return page === 'board' ? url.includes('/board/') : url.includes('/workspace');
    };

    /**
     * Hết giờ thì bỏ qua bước — TRỪ KHI người dùng đang gõ dở.
     *
     * Neo của bước 3 và 4 là loại "bấm vào là biến thành ô nhập tại chỗ". Người
     * dùng đang gõ tên cột mà tour tuyên bố hết giờ rồi bỏ qua chính cái việc họ
     * đang làm là vô lý nhất có thể. Đồng hồ này chỉ để cứu tour khỏi treo khi
     * neo KHÔNG BAO GIỜ xuất hiện, không phải để giục người dùng.
     */
    const armTimeout = () => {
      if (timer || !onRightPage()) return;
      timer = setTimeout(() => {
        const a = document.activeElement as HTMLElement | null;
        const tag = a?.tagName;
        const dangGo =
          tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || a?.isContentEditable;
        if (dangGo) {
          timer = null;
          armTimeout();
          return;
        }
        this.tour.skipStep();
      }, waitMs);
    };

    const existing = document.querySelector<HTMLElement>(selector);
    if (isUsable(existing)) {
      attach(existing);
    } else {
      // Quan sát cả thuộc tính `class`: phần tử có thể đã nằm sẵn trong DOM mà
      // đang bị `.hidden`, và thứ thay đổi là class chứ không phải cây DOM.
      observer = new MutationObserver(() => {
        const found = document.querySelector<HTMLElement>(selector);
        if (isUsable(found)) attach(found);
        else armTimeout();
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
      });
      armTimeout();
    }

    this.cleanupAnchor = () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      if (timer) clearTimeout(timer);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }

  private onKeydown(e: KeyboardEvent): void {
    if (!this.visible()) return;

    // Đang gõ chữ thì phím thuộc về ô nhập, không thuộc về tour.
    //
    // Bước 3 và 4 neo vào "Add list" / "Add card" — bấm vào là chúng biến thành
    // ô nhập ngay tại chỗ (không phải modal, nên `modalOpen` không bắt được).
    // Không chặn ở đây thì người dùng gõ tên cột rồi bấm ← để sửa một chữ cái
    // là tour nhảy về bước trước, và Esc để huỷ ô nhập thì tắt luôn cả tour.
    const el = e.target as HTMLElement | null;
    const tag = el?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) {
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      this.tour.stop();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.tour.skipStep();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.tour.back();
    }
  }

  onSkip(): void {
    this.tour.skipStep();
  }

  onBack(): void {
    this.tour.back();
  }

  onQuit(): void {
    this.tour.stop();
  }
}
