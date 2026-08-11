import { Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';

/** 1 List đã được board.ts đo sẵn từ DOM thật (offset/size dọc theo trục cuộn) —
 *  Mini Map không tự đo, không đụng DOM của Board. */
export interface MinimapListGeom {
  id: string;
  name: string;
  cardCount: number;
  offset: number;
  size: number;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const TRACK_WIDTH = 184;
// Cao hơn hẳn 1 dải mỏng (trước là 60px) để Column View không bị "bé/mờ nhạt" —
// vẫn đủ gọn để nằm lọt khung nổi góc dưới-phải.
const COLUMN_TRACK_HEIGHT = 96;
const ROW_TRACK_MIN_HEIGHT = 110;
const ROW_TRACK_MAX_HEIGHT = 240;
const ROW_ITEM_HEIGHT = 20;
const MIN_RECT_SIZE = 4;
const IDLE_DELAY_MS = 2500;

/** Mini Map — thanh điều hướng thu nhỏ nổi góc dưới-phải Board. Thuần trình bày:
 *  chỉ vẽ 1 hình chữ nhật nhẹ cho mỗi List + khung viewport, không nhân bản DOM
 *  Card/Board. Tự mờ dần sau vài giây không tương tác, sáng lại khi hover. */
@Component({
  selector: 'app-board-minimap',
  imports: [],
  templateUrl: './board-minimap.html',
  styleUrl: './board-minimap.css',
})
export class BoardMinimap {
  readonly layoutMode = input<'column' | 'row'>('column');
  readonly items = input<MinimapListGeom[]>([]);
  readonly scrollPos = input(0);
  readonly viewportSize = input(0);
  readonly contentSize = input(0);

  readonly navigate = output<string>();

  readonly hoveredId = signal<string | null>(null);
  readonly idle = signal(false);
  readonly containerHovered = signal(false);
  readonly dimmed = computed(() => this.idle() && !this.containerHovered());

  private idleTimer?: ReturnType<typeof setTimeout>;

  readonly trackWidth = computed(() => TRACK_WIDTH);
  readonly trackHeight = computed(() => {
    if (this.layoutMode() === 'column') return COLUMN_TRACK_HEIGHT;
    const raw = this.items().length * ROW_ITEM_HEIGHT;
    return Math.min(ROW_TRACK_MAX_HEIGHT, Math.max(ROW_TRACK_MIN_HEIGHT, raw));
  });

  private readonly scale = computed(() => {
    const content = this.contentSize();
    const track = this.layoutMode() === 'column' ? this.trackWidth() : this.trackHeight();
    return content > 0 ? track / content : 0;
  });

  readonly rects = computed(() => {
    const scale = this.scale();
    const horizontal = this.layoutMode() === 'column';
    const trackH = this.trackHeight();
    const trackW = this.trackWidth();
    return this.items().map((item) => {
      const start = item.offset * scale;
      const size = Math.max(item.size * scale, MIN_RECT_SIZE);
      const rect: Rect = horizontal ? { left: start, top: 2, width: size, height: trackH - 4 } : { left: 2, top: start, width: trackW - 4, height: size };
      return { item, rect };
    });
  });

  readonly viewportRect = computed<Rect>(() => {
    const scale = this.scale();
    const horizontal = this.layoutMode() === 'column';
    const start = this.scrollPos() * scale;
    const size = Math.max(this.viewportSize() * scale, MIN_RECT_SIZE);
    return horizontal ? { left: start, top: 0, width: size, height: this.trackHeight() } : { left: 0, top: start, width: this.trackWidth(), height: size };
  });

  readonly hoveredItem = computed(() => {
    const id = this.hoveredId();
    if (!id) return null;
    return this.items().find((i) => i.id === id) ?? null;
  });

  private readonly hoveredRect = computed<Rect | null>(() => {
    const id = this.hoveredId();
    if (!id) return null;
    return this.rects().find((r) => r.item.id === id)?.rect ?? null;
  });

  // Lớp tooltip là 1 overlay absolute cùng kích thước/gốc toạ độ (0,0) với track
  // (xem board-minimap.html) nên không cần cộng thêm padding của khung ngoài.
  readonly tooltipLeft = computed(() => {
    const r = this.hoveredRect();
    return r ? r.left + r.width / 2 : 0;
  });

  readonly tooltipTop = computed(() => {
    const r = this.hoveredRect();
    return r ? r.top - 6 : 0;
  });

  constructor() {
    // Mỗi lần scrollPos đổi (board đang được cuộn) coi là "đang hoạt động" — reset bộ đếm mờ dần.
    effect(() => {
      this.scrollPos();
      this.resetIdleTimer();
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.idleTimer));
  }

  private resetIdleTimer(): void {
    this.idle.set(false);
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.idle.set(true), IDLE_DELAY_MS);
  }

  onHover(id: string | null): void {
    this.hoveredId.set(id);
  }

  onContainerHover(hovered: boolean): void {
    this.containerHovered.set(hovered);
    if (hovered) clearTimeout(this.idleTimer);
    else this.resetIdleTimer();
  }

  onActivate(id: string): void {
    this.navigate.emit(id);
  }
}
