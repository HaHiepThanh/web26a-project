import { Injectable, effect, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'trello_theme';

/**
 * Nguồn sự thật duy nhất cho giao diện sáng/tối.
 *
 * Ghi `data-theme` lên <html> — cùng một cái móc mà `styles.css` dùng để đổi bộ
 * token màu, và cũng là cái daisyUI đọc. Một thuộc tính, hai hệ màu đổi cùng lúc.
 *
 * Vì sao có cả class `dark`: Tailwind v4 mặc định bật biến thể `dark:` theo
 * `prefers-color-scheme` của hệ điều hành, không theo thuộc tính của ta. Giữ
 * class này để các tiện ích `dark:` (nếu component nào dùng) không lệch pha với
 * lựa chọn thủ công của người dùng.
 *
 * Thứ tự ưu tiên khi khởi động: lựa chọn đã lưu → cài đặt hệ điều hành → sáng.
 * Lấy theo hệ điều hành ở lần đầu là mặc định lịch sự: người đã để máy ở chế độ
 * tối thường không muốn bị chói mắt bởi một trang trắng toát.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(readInitialTheme());

  readonly isDark = () => this.theme() === 'dark';

  constructor() {
    effect(() => {
      const theme = this.theme();
      const root = document.documentElement;
      root.setAttribute('data-theme', theme);
      root.classList.toggle('dark', theme === 'dark');
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // Chế độ riêng tư của trình duyệt có thể chặn ghi — đổi theme vẫn phải chạy.
      }
    });
  }

  set(theme: Theme): void {
    this.theme.set(theme);
  }

  toggle(): void {
    this.theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }
}

function readInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // Không đọc được thì rơi xuống cài đặt hệ điều hành bên dưới.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
