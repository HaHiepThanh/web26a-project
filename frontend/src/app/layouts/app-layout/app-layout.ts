import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';

/**
 * Layout cho phần đã đăng nhập: có Header (+ sidebar) và Footer bao quanh nội dung.
 * Các trang con render vào <router-outlet/>.
 */
@Component({
  selector: 'app-app-layout',
  imports: [RouterOutlet, Header, Footer],
  templateUrl: './app-layout.html',
  styleUrl: './app-layout.css',
})
export class AppLayout {
  private readonly router = inject(Router);

  /** Trang Board tự quản lý chiều cao/scroll riêng (không có Footer bên dưới). AppLayout
   *  sống suốt vòng đời app (root shell, không bao giờ bị destroy) nên subscribe thẳng
   *  ở đây mà không cần takeUntilDestroyed(). */
  readonly hideFooter = signal(this.router.url.startsWith('/board/'));

  constructor() {
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => {
      this.hideFooter.set(e.urlAfterRedirects.startsWith('/board/'));
    });
  }
}
