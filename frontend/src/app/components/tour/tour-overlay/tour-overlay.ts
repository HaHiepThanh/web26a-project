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
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { LucideArrowLeft, LucideArrowRight, LucideX } from '@lucide/angular';
import { OrganizationStore } from '../../../ngrx/organization/organization.store';
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
  private readonly orgs = inject(OrganizationStore);
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
  readonly visible = computed(() => this.step() !== null && !this.modalOpen());

  /**
   * Đã tìm thấy neo chưa. Chưa thấy thì KHÔNG ẩn cả tour đi.
   *
   * Bấm F5 rồi "Continue the tour" khi bước đang dở thuộc trang khác — ví dụ
   * đang ở trang workspace mà bước dở là "add-list" của trang board — thì trước
   * đây tour chạy ngầm mà **màn hình trống trơn**: không lớp phủ, không popover,
   * không một chữ nào. Người dùng bấm "chạy tiếp" rồi ngồi nhìn, tưởng hỏng.
   *
   * Giờ vẫn hiện popover ở giữa màn hình và nói rõ phải đi đâu.
   */
  readonly hasAnchor = computed(() => this.anchorRect() !== null);

  /** URL hiện tại, cập nhật theo mỗi lần điều hướng. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /**
   * Chỉ đường khi chưa thấy neo — và phải nói ĐÚNG hoàn cảnh.
   *
   * Có hai lý do rất khác nhau khiến không thấy neo, đừng gộp làm một:
   *   - đang ở sai trang  → bảo họ đi đâu.
   *   - đã đúng trang rồi → thứ cần soi chưa xuất hiện, họ không phải đi đâu cả.
   * Bảo "Open a board" khi người ta đang đứng trong board là câu vô nghĩa, và nó
   * khiến họ đi tìm một việc không tồn tại.
   */
  readonly waitingFor = computed(() => {
    const s = this.step();
    if (!s || this.hasAnchor()) return null;
    const u = this.url();
    const dungTrang = s.page === 'board' ? u.includes('/board/') : u.includes('/workspace');
    if (dungTrang) return 'Waiting for it to show up on this page…';
    return s.page === 'board'
      ? 'Open a board to keep going — this step happens there.'
      : 'Head back to your workspace to keep going.';
  });

  /**
   * Có đưa thẳng người dùng tới nơi được không.
   *
   * Chỉ với bước thuộc trang workspace: ta biết chính xác đường dẫn. Bước thuộc
   * trang board thì không — không biết họ muốn mở board nào, và đoán bừa rồi
   * kéo người ta vào một board lạ còn tệ hơn để họ tự chọn.
   */
  readonly canJumpToWorkspace = computed(
    () => this.waitingFor() !== null && this.step()?.page === 'workspace',
  );

  onJumpToWorkspace(): void {
    const slug = this.orgs.activeOrgSlug();
    void this.router.navigate(slug ? ['/', slug, 'workspace'] : ['/workspace']);
  }

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
    // Chưa có neo → đặt giữa màn hình. Đây là lúc popover đang chỉ đường, nó
    // không thuộc về phần tử nào cả.
    if (!h) {
      const w = Math.min(POPOVER_W, window.innerWidth - 24);
      return {
        top: Math.max(12, window.innerHeight / 2 - this.popoverH() / 2),
        left: Math.max(12, (window.innerWidth - w) / 2),
      };
    }
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

    /**
     * Bám khung neo bằng một vòng lặp theo khung hình, thay vì nghe `scroll` và
     * `resize`.
     *
     * Nghe sự kiện rời rạc bỏ sót mọi thứ KHÔNG phát ra sự kiện: sidebar dài
     * thêm một dòng, một toast chen vào đẩy layout, ảnh tải xong, thanh cuộn
     * xuất hiện làm hẹp vùng nội dung, animation của chính app. Khung neo dịch
     * đi mà không ai đo lại — viền sáng lệch khỏi cái nút.
     *
     * Và quan trọng hơn: bản cũ khi phần tử KHÔNG dùng được thì `return` mà
     * GIỮ NGUYÊN khung cũ. Chuyển sang trang khác là neo biến mất, nhưng viền
     * vẫn vẽ ở toạ độ của trang trước — một khung sáng rỗng chỉ vào chỗ không có
     * gì. Giờ mất neo là xoá khung, lớp phủ tự ẩn cho tới khi tìm lại được.
     *
     * Một `getBoundingClientRect()` mỗi khung hình cho đúng một phần tử là chi
     * phí không đáng kể, và đổi lại là đúng trong mọi trường hợp.
     */
    let lastRect: Rect | null = null;
    const doiKhung = (a: Rect | null, b: Rect | null): boolean =>
      !a || !b || a.top !== b.top || a.left !== b.left || a.width !== b.width || a.height !== b.height;

    const docKhung = () => {
      // Phần tử có thể đã bị thay mới (Angular render lại nhánh khác) — tìm lại.
      if (!el || !el.isConnected) el = document.querySelector<HTMLElement>(selector);

      if (!isUsable(el)) {
        if (lastRect !== null) {
          lastRect = null;
          this.anchorRect.set(null);
        }
        // Neo mất giữa chừng: bấm giờ lại để không treo vô hạn.
        armTimeout();
      } else {
        const r = el.getBoundingClientRect();
        const next: Rect = { top: r.top, left: r.left, width: r.width, height: r.height };
        if (doiKhung(lastRect, next)) {
          lastRect = next;
          this.anchorRect.set(next);
        }
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      }
    };

    const tick = () => {
      docKhung();
      raf = requestAnimationFrame(tick);
    };

    const attach = (found: HTMLElement) => {
      el = found;
      observer?.disconnect();
      observer = null;
      if (timer) clearTimeout(timer);
      timer = null;
      found.scrollIntoView({ block: 'center', behavior: 'smooth' });
      // Đo ngay tại đây, không đợi khung hình kế tiếp. Neo thường xuất hiện MUỘN
      // (danh sách workspace còn đang tải) và tới qua MutationObserver; để vòng
      // lặp lo thì có một quãng popover đã hiện mà chưa soi sáng gì.
      docKhung();
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

    // Đo NGAY một lần, đừng đợi khung hình đầu tiên.
    //
    // `requestAnimationFrame` không chạy khi tab ở nền hoặc trình duyệt chưa
    // dựng khung. Đợi nó mới vẽ viền thì lúc đổi bước có một quãng popover đã
    // hiện mà vùng sáng thì chưa — người dùng đọc chỉ dẫn xong không biết nhìn
    // vào đâu. Đo đồng bộ ở đây khiến viền có mặt cùng lúc với popover.
    docKhung();

    // Rồi vòng lặp lo phần còn lại: bám theo khi bố cục xê dịch, phát hiện neo
    // mất, và tìm lại neo mới. Không cần thêm listener nào.
    raf = requestAnimationFrame(tick);

    this.cleanupAnchor = () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      if (timer) clearTimeout(timer);
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

  /** Bước tầng 2 — đọc xong tự bấm đi tiếp, tour không tự nhảy. */
  readonly needsAck = this.tour.needsAck;
  readonly isLastStep = computed(() => this.tour.stepIndex() >= TOUR_STEPS.length - 1);

  onAck(): void {
    this.tour.acknowledgeStep();
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
