import { Injectable, signal } from '@angular/core';

/**
 * Giả lập độ trễ mạng cho các thao tác optimistic UI (CLAUDE.md #3) khi backend
 * thật chưa nối — không dùng ApiService ở đây. `armFailure()` bắt lần lưu ngầm
 * TIẾP THEO (kéo-thả card hoặc list) thất bại, để demo hành vi rollback/toast lỗi
 * (giống nút "🎲 Giả lập lỗi mạng" trong design-demos/07-optimistic-ui-drag-drop.html).
 */
@Injectable({ providedIn: 'root' })
export class MockNetworkService {
  private readonly failNextSave = signal(false);
  readonly armed = this.failNextSave.asReadonly();

  armFailure(): void {
    this.failNextSave.set(true);
  }

  /** Trễ ~500-900ms rồi resolve, hoặc reject 1 lần nếu vừa `armFailure()`. */
  async simulateSave(): Promise<void> {
    const shouldFail = this.failNextSave();
    if (shouldFail) this.failNextSave.set(false);

    await new Promise((resolve) => setTimeout(resolve, 550 + Math.random() * 350));

    if (shouldFail) {
      throw new Error('Mô phỏng lỗi mạng');
    }
  }
}
