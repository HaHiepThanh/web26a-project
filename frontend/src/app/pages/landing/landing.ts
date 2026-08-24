import {
  Component,
  DOCUMENT,
  OnDestroy,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideArrowRight, LucideMenu, LucideMoon, LucideSun, LucideX } from '@lucide/angular';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';
import { LandingAi } from './sections/landing-ai';
import { LandingCompare } from './sections/landing-compare';
import { LandingCta } from './sections/landing-cta';
import { LandingFaq } from './sections/landing-faq';
import { LandingFeatures } from './sections/landing-features';
import { LandingHero } from './sections/landing-hero';
import { LandingStats } from './sections/landing-stats';
import { LandingSteps } from './sections/landing-steps';
import { LandingStory } from './sections/landing-story';

/**
 * Trang giới thiệu — route `/`, đứng ngoài cả auth-layout lẫn app-layout vì nó
 * có thanh điều hướng và chân trang riêng, không dùng header của app.
 *
 * Component này chỉ lo phần khung: thanh điều hướng, nút đổi theme, chân trang,
 * và thứ tự các khu vực. Mỗi khu vực là một component riêng trong `sections/`
 * — chia nhỏ vì mỗi khu vực có bộ hoạt ảnh riêng, gom một chỗ thì file CSS
 * phình tới mức không ai dò nổi.
 *
 * Trình bày bám theo "Practical UI" (Adham Dannaway):
 *  - Phân cấp bằng kích thước / màu / tương phản / khoảng trắng / vị trí / độ nổi,
 *    không bao giờ chỉ bằng màu (người mù màu vẫn phải đọc ra thứ tự ưu tiên).
 *  - Thang chữ Major Third (1.25) trên nền 18px, thang khoảng cách bội số 8.
 *  - Mỗi khu vực đúng MỘT nút chính; còn lại là nút phụ hoặc nút mờ.
 *  - Độ dài dòng 40–80 ký tự (biến `--lp-measure`).
 *  Xem `_landing-shared.css` để biết các quyết định trên nằm ở đâu.
 */
@Component({
  selector: 'app-landing',
  imports: [
    RouterLink,
    LandingHero,
    LandingFeatures,
    LandingAi,
    LandingStory,
    LandingCompare,
    LandingSteps,
    LandingStats,
    LandingFaq,
    LandingCta,
    LucideArrowRight,
    LucideMenu,
    LucideMoon,
    LucideSun,
    LucideX,
  ],
  templateUrl: './landing.html',
  styleUrls: ['./_landing-shared.css', './landing.css'],
  host: {
    // Nội dung trang này là tiếng Anh trong khi phần còn lại của app vẫn đang
    // tiếng Việt (thẻ <html> khai lang="vi"). Khai lang ngay trên phần tử gốc
    // của trang để trình đọc màn hình đổi đúng giọng đọc, và để trình duyệt
    // ngắt từ / kiểm chính tả theo đúng ngôn ngữ. Khi cả app dịch xong thì đổi
    // luôn lang trên <html> rồi bỏ dòng này.
    lang: 'en',
    '(window:scroll)': 'onScroll()',
    // Escape đóng menu — phản xạ mà ai cũng thử trước khi đi tìm nút X.
    '(document:keydown.escape)': 'closeMenu()',
  },
})
export class Landing implements OnDestroy {
  private readonly themeService = inject(ThemeService);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);

  readonly theme = this.themeService.theme;
  readonly isDark = computed(() => this.theme() === 'dark');
  readonly isLoggedIn = this.auth.isLoggedIn;

  /** Đã rời khỏi đỉnh trang chưa — nav đổi từ trong suốt sang nền mờ. */
  readonly scrolled = signal(false);
  readonly menuOpen = signal(false);

  readonly navLinks = [
    { id: 'features', label: 'Features' },
    { id: 'assistant', label: 'Assistant' },
    { id: 'how-it-works', label: 'How it works' },
    { id: 'why-not-trello', label: 'Why not Trello' },
    { id: 'faq', label: 'FAQ' },
  ];

  /** Mốc đang hiện trên màn hình — dùng để làm nổi link tương ứng ở thanh nav. */
  readonly activeSection = signal<string | null>(null);

  private sectionObserver?: IntersectionObserver;
  /** Theo dõi ngưỡng 900px — đúng ngưỡng mà CSS chuyển nav sang dạng đầy đủ. */
  private wideQuery?: MediaQueryList;

  constructor() {
    // Khoá cuộn trang phía sau khi menu đang mở. Không khoá thì người dùng vuốt
    // trên tấm menu là cả trang bên dưới trôi theo — mở menu ra xong lạc mất chỗ
    // đang đọc. Chỉ xảy ra dưới 900px nên không lo nhảy layout vì mất thanh cuộn.
    effect(() => {
      this.document.body.style.overflow = this.menuOpen() ? 'hidden' : '';
    });

    afterNextRender(() => {
      // Đọc vị trí cuộn NGAY khi dựng xong, đừng đợi sự kiện scroll đầu tiên.
      // Tải lại trang giữa chừng (trình duyệt tự khôi phục vị trí cuộn) hoặc mở
      // thẳng một liên kết có #mốc thì chưa có cú cuộn nào cả — nav sẽ nằm trong
      // suốt đè lên nội dung cho tới khi người dùng lỡ tay cuộn một cái.
      this.onScroll();

      // Phóng cửa sổ từ mobile lên desktop trong lúc menu đang mở: CSS ẩn tấm
      // menu đi nhưng cờ menuOpen vẫn bật, mà cờ đó còn ép thanh nav ở dạng nền
      // đặc. Kết quả là nav đục ngay cả khi đang ở đỉnh trang.
      this.wideQuery = window.matchMedia('(min-width: 900px)');
      this.wideQuery.addEventListener('change', this.onBreakpointChange);

      // Theo dõi khu vực nào đang ở giữa màn hình để tô đậm link tương ứng.
      // Cùng thủ thuật rootMargin như phần kể chuyện: bóp vùng quan sát thành
      // một dải mỏng giữa khung nhìn, nhờ vậy mỗi lúc chỉ một mốc được coi là
      // "đang xem".
      //
      // KHÔNG unobserve sau lần đầu — khác các hiệu ứng hiện-một-lần, cái này
      // phải theo dõi suốt vì người dùng cuộn lên xuống bao nhiêu lần cũng được.
      if (typeof IntersectionObserver === 'undefined') return;

      this.sectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) this.activeSection.set(entry.target.id);
            // Rời khỏi dải giữa mà không có mốc nào khác thế chỗ (vd đang ở
            // hero hoặc chân trang) thì bỏ đánh dấu, chứ không giữ mốc cũ sáng
            // trong khi mắt đã ở chỗ khác.
            else if (this.activeSection() === entry.target.id) this.activeSection.set(null);
          }
        },
        { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
      );

      for (const link of this.navLinks) {
        const el = this.document.getElementById(link.id);
        if (el) this.sectionObserver.observe(el);
      }
    });
  }

  /** Qua ngưỡng desktop thì tấm menu thu gọn không còn nghĩa lý gì — đóng nó lại. */
  private readonly onBreakpointChange = (event: MediaQueryListEvent): void => {
    if (event.matches) this.closeMenu();
  };

  onScroll(): void {
    this.scrolled.set(window.scrollY > 12);
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  /**
   * Bấm logo thì về đầu trang.
   *
   * `routerLink="/"` trỏ đúng route đang mở, nên Angular thấy không có gì để
   * điều hướng và không làm gì cả — người dùng đang ở giữa trang bấm logo sẽ
   * thấy nó đứng im. Mà logo góc trái trên là chỗ ai cũng bấm theo phản xạ để
   * quay về đầu, nhất là với một trang dài gần chín màn hình.
   *
   * Vẫn giữ thẻ <a href> thật: chuột giữa, Ctrl+bấm hay chuột phải phải mở được
   * tab mới như mọi liên kết khác. Nên chỉ chặn đúng cú bấm trái đơn thuần —
   * còn lại để trình duyệt lo.
   */
  scrollToTop(event: MouseEvent): void {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
      return;
    event.preventDefault();
    this.closeMenu();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }

  /**
   * Cuộn mượt tới một mốc trong trang.
   *
   * Chặn hành vi mặc định của thẻ <a> thay vì dựa vào `scroll-behavior: smooth`
   * toàn cục, vì cuộn mượt áp cho cả app sẽ làm mọi lần chuyển route trong
   * phần đã đăng nhập trôi lừ đừ theo. Ở đây chỉ trang này cần.
   */
  scrollTo(id: string, event: Event): void {
    event.preventDefault();
    this.closeMenu();
    const target = this.document.getElementById(id);
    if (!target) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }

  ngOnDestroy(): void {
    this.sectionObserver?.disconnect();
    this.wideQuery?.removeEventListener('change', this.onBreakpointChange);
    // Rời trang trong lúc menu còn mở (bấm một liên kết trong menu là đúng
    // trường hợp đó) — không trả lại thì cả app kẹt ở trạng thái không cuộn được.
    this.document.body.style.overflow = '';
  }
}
