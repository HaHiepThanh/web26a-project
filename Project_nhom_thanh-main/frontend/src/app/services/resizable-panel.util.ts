import { WritableSignal, signal } from '@angular/core';

export interface ResizablePanelOptions {
  defaultWidth: number;
  minWidth: number;
  collapsedWidth: number;
  maxWidthRatio: number;
  widthStorageKey: string;
  collapsedStorageKey: string;
  /** true khi tay cầm nằm ở CẠNH TRÁI panel (panel dock bên phải màn hình, vd
   *  DashboardChat) — kéo sang trái phải phình rộng ra, ngược chiều delta con
   *  trỏ so với panel dock bên trái (ChatPanel của board, tay cầm cạnh phải). */
  invertDrag?: boolean;
}

export interface ResizablePanel {
  readonly minWidth: number;
  readonly collapsedWidth: number;
  readonly width: WritableSignal<number>;
  readonly collapsed: WritableSignal<boolean>;
  readonly isResizing: WritableSignal<boolean>;
  maxWidth(): number;
  startResize(event: PointerEvent): void;
  onHandleKeydown(event: KeyboardEvent): void;
  toggleCollapsed(): void;
}

/**
 * Kéo-thả đổi bề rộng + thu gọn thành dải mỏng, dùng chung cho mọi panel dạng
 * dock (ChatPanel của board, DashboardChat...) — tách ra từ ChatPanel gốc để
 * không phải chép lại y hệt logic rAF-throttle/clamp/localStorage cho panel
 * thứ 2 (#chat-hub kiến trúc "Do NOT duplicate logic").
 */
export function createResizablePanel(opts: ResizablePanelOptions): ResizablePanel {
  const { defaultWidth, minWidth, collapsedWidth, maxWidthRatio, widthStorageKey, collapsedStorageKey, invertDrag = false } = opts;
  const dragSign = invertDrag ? -1 : 1;

  const width = signal(defaultWidth);
  const collapsed = signal(false);
  const isResizing = signal(false);
  let resizeRafId: number | null = null;

  function maxWidth(): number {
    return Math.round(window.innerWidth * maxWidthRatio);
  }

  function clampWidth(w: number): number {
    return Math.min(Math.max(w, minWidth), maxWidth());
  }

  function persistWidth(): void {
    try {
      localStorage.setItem(widthStorageKey, String(width()));
    } catch {
      /* localStorage không khả dụng — bỏ qua, chỉ mất tính năng nhớ bề rộng */
    }
  }

  try {
    const raw = localStorage.getItem(widthStorageKey);
    if (raw) width.set(clampWidth(Number(raw) || defaultWidth));
  } catch {
    width.set(defaultWidth);
  }
  try {
    collapsed.set(localStorage.getItem(collapsedStorageKey) === '1');
  } catch {
    collapsed.set(false);
  }

  function startResize(event: PointerEvent): void {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width();
    isResizing.set(true);

    const onMove = (e: PointerEvent): void => {
      const next = clampWidth(startWidth + dragSign * (e.clientX - startX));
      if (resizeRafId !== null) return;
      resizeRafId = requestAnimationFrame(() => {
        width.set(next);
        resizeRafId = null;
      });
    };

    const onUp = (): void => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      isResizing.set(false);
      persistWidth();
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp, { once: true });
  }

  /** Bàn phím thay chuột trên tay cầm resize (ARIA "separator" pattern, #accessibility). */
  function onHandleKeydown(event: KeyboardEvent): void {
    const STEP = 16;
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = width() - STEP;
    else if (event.key === 'ArrowRight') next = width() + STEP;
    else if (event.key === 'Home') next = minWidth;
    else if (event.key === 'End') next = maxWidth();
    if (next === null) return;
    event.preventDefault();
    width.set(clampWidth(next));
    persistWidth();
  }

  function toggleCollapsed(): void {
    collapsed.update((v) => !v);
    try {
      localStorage.setItem(collapsedStorageKey, collapsed() ? '1' : '0');
    } catch {
      /* bỏ qua */
    }
  }

  return { minWidth, collapsedWidth, width, collapsed, isResizing, maxWidth, startResize, onHandleKeydown, toggleCollapsed };
}
