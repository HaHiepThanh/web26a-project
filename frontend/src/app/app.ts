import { Component, effect, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { OfflineOverlay } from './components/offline-overlay/offline-overlay';
import { AuthService } from './services/auth.service';
import { OverdueWatcherService } from './services/overdue-watcher.service';
import { RealtimeService } from './services/realtime.service';
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

  private readonly auth = inject(AuthService);
  private readonly realtime = inject(RealtimeService);

  // Cùng lý do với ThemeService ở trên: chỉ inject để CTOR chạy từ GỐC ứng dụng.
  // Service tự bật/tắt theo trạng thái đăng nhập bằng effect() bên trong nó.
  private readonly overdueWatcher = inject(OverdueWatcherService);

  constructor() {
    // Mở kết nối realtime ở GỐC ứng dụng, không phải trong Header.
    //
    // ⚠️ Bản trước đặt ở Header, mà Header chỉ nằm trong `app-layout`. Trang
    //    /onboarding lại nằm NGOÀI layout đó — đúng nơi một người vừa được mời
    //    (chưa thuộc tổ chức nào) bị đưa tới. Họ ngồi ở màn đó và lời mời KHÔNG
    //    BAO GIỜ tới, phải F5 mới thấy. Cùng lỗi mà ThemeService từng mắc, xem
    //    ghi chú ở trên.
    effect(() => {
      if (this.auth.isLoggedIn()) this.realtime.ensureConnected();
      else this.realtime.disconnect();
    });
  }

  protected readonly title = signal('frontend');
}
