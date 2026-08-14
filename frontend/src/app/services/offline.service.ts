import { Injectable, signal } from '@angular/core';

/**
 * Theo dõi kết nối mạng THẬT của trình duyệt (navigator.onLine + sự kiện
 * online/offline) — khác với MockNetworkService (chỉ giả lập lỗi lưu optimistic
 * UI). Dùng để hiện overlay "Mất kết nối mạng" toàn app khi rớt mạng thật.
 */
@Injectable({ providedIn: 'root' })
export class OfflineService {
  readonly offline = signal(!navigator.onLine);

  constructor() {
    window.addEventListener('online', () => this.offline.set(false));
    window.addEventListener('offline', () => this.offline.set(true));
  }
}
