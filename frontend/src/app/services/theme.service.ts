import { Injectable, signal, effect } from '@angular/core';

export type Theme = 'light' | 'dark';

/** Dark/light mode (#9). Lưu lựa chọn vào localStorage, đồng bộ class trên <html>. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>('light');

  constructor() {
    // TODO: đọc theme đã lưu từ localStorage (hoặc prefers-color-scheme) -> set signal.
    // TODO: effect() -> mỗi khi theme đổi: thêm/xoá class 'dark' trên document.documentElement
    //       và lưu lại localStorage.
  }

  // TODO: đảo light <-> dark.
  toggle(): void {}
}
