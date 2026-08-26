import { Component, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { MobileActionBar } from '../../components/mobile-action-bar/mobile-action-bar';
import { CoachMark } from '../../components/tour/coach-mark/coach-mark';
import { TourChecklist } from '../../components/tour/tour-checklist/tour-checklist';
import { TourInvitation } from '../../components/tour/tour-invitation/tour-invitation';
import { TourOverlay } from '../../components/tour/tour-overlay/tour-overlay';
import { TourPrompt } from '../../components/tour/tour-prompt/tour-prompt';
import { TourStore } from '../../ngrx/tour/tour.store';
import { AuthService } from '../../services/auth.service';
import { emptyOnboardingState } from '../../models';

/**
 * Layout cho phần đã đăng nhập: có Header (+ sidebar) và Footer bao quanh nội dung.
 * Các trang con render vào <router-outlet/>.
 */
@Component({
  selector: 'app-app-layout',
  imports: [RouterOutlet, Header, Footer, MobileActionBar, TourOverlay, TourInvitation, TourChecklist, TourPrompt, CoachMark],
  templateUrl: './app-layout.html',
  styleUrl: './app-layout.css',
  // Trang Board cần khung cao đúng màn hình kể cả trên điện thoại (cột kanban tự
  // cuộn bên trong). `hideFooter()` đã đúng bằng "đang ở Board" nên dùng lại làm
  // dấu, thay vì thêm một tín hiệu thứ hai phải nhớ giữ cho khớp.
  host: {
    '[class.trang-board]': 'hideFooter()',
    // Để CSS biết có phải chừa chỗ dưới cho thanh nổi hay không — trang không có
    // thanh mà vẫn chừa thì thành một khoảng trống vô cớ ở cuối trang.
    '[class.co-thanh-mobile]': 'hienThanhMobile()',
  },
})
export class AppLayout {
  private readonly router = inject(Router);
  private readonly tour = inject(TourStore);
  private readonly auth = inject(AuthService);

  /** Trang Board tự quản lý chiều cao/scroll riêng (không có Footer bên dưới). AppLayout
   *  sống suốt vòng đời app (root shell, không bao giờ bị destroy) nên subscribe thẳng
   *  ở đây mà không cần takeUntilDestroyed(). */
  readonly hideFooter = signal(AppLayout.laTrangBoard(this.router.url));

  /**
   * Thanh thao tác nổi ở đáy CHỈ hiện ở trang Workspace.
   *
   * Ba nút của nó — tạo nhanh, tìm kiếm board, menu — đều chỉ có nghĩa khi đang
   * nhìn danh sách workspace. Sang trang Cài đặt hay vào trong Board thì chúng
   * không thao tác được gì trên nội dung đang xem, mà vẫn chiếm một góc màn hình
   * và che mất phần dưới — riêng trong Board thì đè lên đúng vùng kéo thả thẻ.
   */
  readonly hienThanhMobile = signal(AppLayout.laTrangWorkspace(this.router.url));

  constructor() {
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => {
      this.hideFooter.set(AppLayout.laTrangBoard(e.urlAfterRedirects));
      this.hienThanhMobile.set(AppLayout.laTrangWorkspace(e.urlAfterRedirects));
    });

    // Đổ trạng thái tour đã lưu vào store mỗi khi hồ sơ người dùng thay đổi —
    // gồm cả lần `/auth/me` trả về sau khi khôi phục phiên đăng nhập.
    effect(() => {
      const user = this.auth.currentUser();
      this.tour.hydrate(user?.onboardingState ?? emptyOnboardingState());
    });
  }

  /**
   * Đang ở trang Board hay không.
   *
   * ⚠️ Trước đây chỗ này là `url.startsWith('/board/')` và LUÔN sai: đường dẫn
   *    thật của board có tiền tố tổ chức — `/:orgSlug/board/:id`, ví dụ
   *    `/acme/board/123` — nên phép so không bao giờ khớp. Hậu quả là footer vẫn
   *    hiện ở trang Board, đúng thứ mà chính chú thích ngay trên nói là không
   *    nên có. (Vẫn còn route `/board/:id` không tiền tố, nhưng nó chỉ là bước
   *    trung chuyển rồi chuyển hướng sang dạng có slug.)
   *
   *    Dùng `includes` để trúng cả hai dạng. Cắt bỏ query và hash trước cho chắc,
   *    tránh một tham số nào đó tình cờ chứa "/board/" làm lệch kết quả.
   */
  private static laTrangBoard(url: string): boolean {
    return AppLayout.duongDan(url).includes('/board/');
  }

  /**
   * Đang ở trang Workspace hay không. Đường dẫn thật là `/:orgSlug/workspace`,
   * ví dụ `/acme/workspace`. (Còn `/workspace` trơn chỉ là bước trung chuyển rồi
   * chuyển hướng sang dạng có slug — ta đọc `urlAfterRedirects` nên luôn thấy
   * dạng sau.)
   *
   * ⚠️ Dấu `/` trước `workspace` là bắt buộc, không được bỏ: `/settings/manage-workspace`
   *    cũng kết thúc bằng chữ "workspace", nhưng ký tự đứng trước là `-` nên
   *    `endsWith('/workspace')` loại đúng nó ra. Nếu dùng `includes('workspace')`
   *    thì thanh sẽ hiện nhầm ở cả trang Quản lý workspace trong Cài đặt.
   */
  private static laTrangWorkspace(url: string): boolean {
    return AppLayout.duongDan(url).endsWith('/workspace');
  }

  /** Bỏ query và hash, chỉ giữ phần đường dẫn — tránh một tham số nào đó tình cờ
   *  chứa "/board/" hay "/workspace" làm lệch kết quả. */
  private static duongDan(url: string): string {
    return url.split('?')[0].split('#')[0];
  }
}
