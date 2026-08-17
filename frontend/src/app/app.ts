import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { OfflineOverlay } from './components/offline-overlay/offline-overlay';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, OfflineOverlay],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  // Chỉ inject để CTOR của service chạy ngay khi app khởi động — service tự set
  // [data-theme] lên <html> qua effect() nội bộ (xem theme.service.ts). Trước đây
  // ThemeService chỉ được inject trong Header (app-layout), nên các trang auth-layout
  // (login/register/...) không có Header không bao giờ khởi tạo service này: [data-theme]
  // bị bỏ trống, khiến daisyUI tự rơi về theme tối theo prefers-color-scheme của trình
  // duyệt trong khi phần còn lại của trang vẫn đang ở theme sáng thủ công của app — chữ
  // trong input tối trùng màu nền input cũng tối do daisyUI tự vẽ riêng.
  private readonly themeService = inject(ThemeService);

  protected readonly title = signal('frontend');
}
