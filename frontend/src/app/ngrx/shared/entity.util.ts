/**
 * Tiện ích dùng chung cho các store — hàm thuần, không phụ thuộc Angular hay NgRx.
 *
 * Giữ chúng ở đây thay vì lặp trong từng store: `groupBy` và `midpoint` là hai
 * thứ cả ba miền (list, card, workspace) đều cần, và `midpoint` mà mỗi nơi tính
 * một kiểu là kéo thả sinh ra thứ tự khác nhau tuỳ màn hình.
 */

/** Thứ gì cũng phải có `id` mới bỏ vào `withEntities` được. */
export interface HasId {
  id: string;
}

/**
 * Thêm/ghi đè một phần tử vào mảng theo `id`, giữ nguyên thứ tự cũ.
 *
 * Dùng cho những chỗ CHƯA chuyển sang `withEntities` (state dạng
 * `Record<string, T[]>` chẳng hạn). Với store có `withEntities` thì dùng thẳng
 * `upsertEntity` của NgRx, đừng dùng hàm này.
 */
export function withId<T extends HasId>(items: readonly T[], item: T): T[] {
  const i = items.findIndex((x) => x.id === item.id);
  if (i === -1) return [...items, item];
  const next = [...items];
  next[i] = item;
  return next;
}

/** Bỏ phần tử theo `id`. Không có thì trả lại mảng cũ nguyên vẹn. */
export function withoutId<T extends HasId>(items: readonly T[], id: string): T[] {
  const i = items.findIndex((x) => x.id === id);
  return i === -1 ? [...items] : items.filter((x) => x.id !== id);
}

/** Gom mảng thành `Record<khoá, T[]>`, giữ nguyên thứ tự trong từng nhóm. */
export function groupBy<T>(items: readonly T[], key: (item: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of items) {
    const k = key(item);
    (out[k] ??= []).push(item);
  }
  return out;
}

/**
 * `position` cho phần tử được thả vào giữa `before` và `after`.
 *
 * Cột `position` là số THỰC, nên chèn vào giữa chỉ cần lấy trung bình cộng của
 * hai hàng xóm — đổi ĐÚNG MỘT phần tử thay vì đánh số lại cả danh sách. Giữ y
 * hệt công thức mà `list.service.ts` và `card.service.ts` đang dùng, nếu không
 * kéo thả sẽ ra thứ tự khác nhau tuỳ chỗ.
 *
 * @param before phần tử đứng ngay trước vị trí thả (null = thả lên đầu)
 * @param after  phần tử đứng ngay sau vị trí thả (null = thả xuống cuối)
 */
export function midpoint(before: number | null, after: number | null): number {
  if (before === null && after === null) return 0;
  if (before === null) return (after as number) - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
}

/** So sánh theo `position` tăng dần — truyền thẳng vào `[...items].sort(byPosition)`. */
export function byPosition<T extends { position: number }>(a: T, b: T): number {
  return a.position - b.position;
}

/** So sánh theo thời gian tạo, cũ → mới. */
export function byCreatedAt<T extends { createdAt: string }>(a: T, b: T): number {
  return a.createdAt.localeCompare(b.createdAt);
}
