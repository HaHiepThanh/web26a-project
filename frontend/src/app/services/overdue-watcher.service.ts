import { DestroyRef, Injectable, effect, inject } from '@angular/core';
import { ApiOverdueCard } from '../models';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';

/**
 * Bao lâu hỏi lại một lần.
 *
 * Một thẻ chỉ đổi từ "còn hạn" sang "quá hạn" đúng một lần mỗi ngày, lúc nửa
 * đêm — không có gì để hỏi dồn dập. 15 phút là đủ để người mở tab qua đêm sáng
 * ra thấy thông báo mà không phải F5, mà vẫn chỉ tốn 4 request/giờ.
 */
const CHU_KY_MS = 15 * 60 * 1000;

/**
 * Theo dõi thẻ QUÁ HẠN được giao cho tôi và đẩy vào chuông 🔔.
 *
 * Vì sao phải hỏi server chứ không lọc từ `CardStore` đang có sẵn: `CardStore`
 * chỉ giữ thẻ của board đang mở. Thẻ quá hạn ở board đó thì người dùng đang
 * nhìn thấy tận mắt rồi, báo thêm cũng bằng thừa — cái đáng báo nằm ở những
 * board họ KHÔNG mở, và chỉ backend mới quét được hết (`GET /cards/my-due`).
 *
 * Không dùng WebSocket vì "thẻ vừa quá hạn" không phải hành động của ai cả, nó
 * xảy ra do thời gian trôi qua; không có sự kiện nào để mà phát.
 */
@Injectable({ providedIn: 'root' })
export class OverdueWatcherService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Đăng nhập thì bật, đăng xuất thì tắt — không để hẹn giờ chạy tiếp và bắn
    // request 401 sau khi người dùng đã thoát.
    effect(() => {
      if (this.auth.isLoggedIn()) this.start();
      else this.stop();
    });

    inject(DestroyRef).onDestroy(() => this.stop());
  }

  private start(): void {
    if (this.timer) return;
    void this.check();
    this.timer = setInterval(() => void this.check(), CHU_KY_MS);
  }

  private stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Hỏi server rồi đẩy từng thẻ vào chuông.
   *
   * `addCardOverdue` khoá trùng theo thẻ + hạn nên gọi lại bao nhiêu lần cũng
   * chỉ ra một thông báo cho mỗi thẻ — chỗ này không phải tự nhớ đã báo gì.
   */
  async check(): Promise<void> {
    try {
      const rows = await this.api.get<ApiOverdueCard[]>('/cards/my-due');
      for (const r of rows) this.notifications.addCardOverdue(r);
    } catch {
      // Mất mạng hoặc token vừa hết hạn — im lặng bỏ qua, lần hẹn sau hỏi lại.
      // Nhắc hạn không đáng để đẩy một dải báo lỗi lên màn hình người dùng.
    }
  }
}
