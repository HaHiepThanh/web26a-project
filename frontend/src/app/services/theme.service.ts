import { Injectable, effect, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'trello_theme';

/**
 * Tên theme daisyUI tương ứng với mỗi chế độ. Giữ 'light'/'dark' làm tên gọi
 * bên trong app (hàng chục chỗ đang so sánh `theme() === 'dark'`), chỉ đổi
 * chuỗi thực sự ghi ra [data-theme] — đó mới là thứ daisyUI đọc để chọn bảng màu.
 */
const DAISY_THEME: Record<Theme, string> = {
  light: 'winter',
  dark: 'night',
};

/** Một cặp tên theme daisyUI thay cho cặp mặc định ở trên. */
export type DaisyThemePair = Record<Theme, string>;

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

  /**
   * Bảng theme daisyUI đang có hiệu lực. Mặc định là cặp winter/sunset của app;
   * một trang có thể tạm mượn cặp khác qua `useThemes()`.
   *
   * Là signal chứ không phải biến thường để effect bên dưới tự chạy lại khi
   * trang đăng ký hoặc trả lại bản ghi đè — nếu không, đổi bảng lúc đang ở chế
   * độ tối sẽ chẳng có gì xảy ra cho tới lần bấm nút đổi theme kế tiếp.
   */
  private readonly pair = signal<DaisyThemePair>(DAISY_THEME);

  readonly isDark = () => this.theme() === 'dark';

  constructor() {
    effect(() => {
      const theme = this.theme();
      const root = document.documentElement;
      root.setAttribute('data-theme', this.pair()[theme]);
      root.classList.toggle('dark', theme === 'dark');
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // Chế độ riêng tư của trình duyệt có thể chặn ghi — đổi theme vẫn phải chạy.
      }
    });
  }

  /**
   * Cho một trang mượn cặp theme daisyUI khác trong lúc nó đang mở.
   *
   * Có để trang giới thiệu dùng winter/night trong khi phần app còn lại giữ
   * winter/sunset. Chế độ sáng/tối mà người dùng đang chọn KHÔNG đổi — chỉ đổi
   * bảng màu vẽ ra cái chế độ đó.
   *
   * Vì sao đi qua đây thay vì để trang tự ghi `data-theme` lên <html>: như thế
   * sẽ có hai chỗ cùng ghi một thuộc tính, và mỗi lần bấm nút đổi theme là
   * effect ở đây ghi giá trị của app trước, trang ghi đè sau — người dùng thấy
   * màu nháy một nhịp rồi mới đúng. Một người ghi thì không có cửa cho lỗi đó.
   *
   * @returns hàm trả lại cặp mặc định. Trang PHẢI gọi nó lúc bị huỷ, nếu không
   *          cặp mượn sẽ theo người dùng sang cả phần app.
   */
  useThemes(pair: DaisyThemePair): () => void {
    this.pair.set(pair);
    return () => this.pair.set(DAISY_THEME);
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
