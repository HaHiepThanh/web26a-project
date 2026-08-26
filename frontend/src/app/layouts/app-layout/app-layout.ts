import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { MobileActionBar } from '../../components/mobile-action-bar/mobile-action-bar';

/**
 * Layout cho phần đã đăng nhập: có Header (+ sidebar) và Footer bao quanh nội dung.
 * Các trang con render vào <router-outlet/>.
 */
@Component({
  selector: 'app-app-layout',
  imports: [RouterOutlet, Header, Footer, MobileActionBar],
  templateUrl: './app-layout.html',
  styleUrl: './app-layout.css',
  // Trang Board cần khung cao đúng màn hình kể cả trên điện thoại (cột kanban tự
  // cuộn bên trong). `hideFooter()` đã đúng bằng "đang ở Board" nên dùng lại làm
  // dấu, thay vì thêm một tín hiệu thứ hai phải nhớ giữ cho khớp.
  host: { '[class.trang-board]': 'hideFooter()' },
})
export class AppLayout {
  private readonly router = inject(Router);

  /** Trang Board tự quản lý chiều cao/scroll riêng (không có Footer bên dưới). AppLayout
   *  sống suốt vòng đời app (root shell, không bao giờ bị destroy) nên subscribe thẳng
   *  ở đây mà không cần takeUntilDestroyed(). */
  readonly hideFooter = signal(AppLayout.laTrangBoard(this.router.url));

  constructor() {
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => {
      this.hideFooter.set(AppLayout.laTrangBoard(e.urlAfterRedirects));
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
    return url.split('?')[0].split('#')[0].includes('/board/');
  }
}
