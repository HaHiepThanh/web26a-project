import { Component, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
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
  imports: [RouterOutlet, Header, Footer, TourOverlay, TourInvitation, TourChecklist, TourPrompt],
  templateUrl: './app-layout.html',
  styleUrl: './app-layout.css',
})
export class AppLayout {
  private readonly router = inject(Router);
  private readonly tour = inject(TourStore);
  private readonly auth = inject(AuthService);

  /** Trang Board tự quản lý chiều cao/scroll riêng (không có Footer bên dưới). AppLayout
   *  sống suốt vòng đời app (root shell, không bao giờ bị destroy) nên subscribe thẳng
   *  ở đây mà không cần takeUntilDestroyed(). */
  readonly hideFooter = signal(this.router.url.startsWith('/board/'));

  constructor() {
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => {
      this.hideFooter.set(e.urlAfterRedirects.startsWith('/board/'));
    });

    // Đổ trạng thái tour đã lưu vào store mỗi khi hồ sơ người dùng thay đổi —
    // gồm cả lần `/auth/me` trả về sau khi khôi phục phiên đăng nhập.
    effect(() => {
      const user = this.auth.currentUser();
      this.tour.hydrate(user?.onboardingState ?? emptyOnboardingState());
    });
  }
}
