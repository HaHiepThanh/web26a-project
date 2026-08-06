import { Injectable } from '@angular/core';

/**
 * Giả lập độ trễ mạng cho các thao tác optimistic UI (CLAUDE.md #3) khi backend
 * thật chưa nối — không dùng ApiService ở đây.
 */
@Injectable({ providedIn: 'root' })
export class MockNetworkService {
  /** Trễ ~500-900ms rồi resolve. */
  async simulateSave(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 550 + Math.random() * 350));
  }
}
