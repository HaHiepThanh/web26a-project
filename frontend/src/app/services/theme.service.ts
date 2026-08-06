import { Injectable, signal, effect } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'trello_theme';

function readInitialTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Dark/light mode (#9). Lưu lựa chọn vào localStorage, đồng bộ class trên <html>. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(readInitialTheme());

  constructor() {
    effect(() => {
      const theme = this.theme();
      document.documentElement.classList.toggle('dark', theme === 'dark');
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem(STORAGE_KEY, theme);
    });
  }

  set(theme: Theme): void {
    this.theme.set(theme);
  }

  toggle(): void {
    this.theme.set(this.theme() === 'dark' ? 'light' : 'dark');
  }
}
