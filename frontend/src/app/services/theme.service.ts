import { Injectable, signal, effect } from '@angular/core';

export type Theme = 'light';

const STORAGE_KEY = 'trello_theme';

/** Enforces light mode across the entire application. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>('light');

  constructor() {
    effect(() => {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem(STORAGE_KEY, 'light');
    });
  }

  set(_theme: Theme): void {
    this.theme.set('light');
  }

  toggle(): void {
    this.theme.set('light');
  }
}
