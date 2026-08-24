/** Helper thuần, dùng chung cho mọi store — không giữ state, không inject gì. */

/** Predicate "id trùng" — dùng với `.find()` cho gọn: `all.find(withId(id))`. */
export function withId<T extends { id: string }>(id: string): (x: T) => boolean {
  return (x) => x.id === id;
}

/** Predicate "id khác" — dùng với `.filter()` để loại 1 phần tử theo id. */
export function withoutId<T extends { id: string }>(id: string): (x: T) => boolean {
  return (x) => x.id !== id;
}

/** Gom mảng thành `Map<khoá, phần tử[]>` — vd gom message theo boardId. */
export function groupBy<T, K>(items: readonly T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

/**
 * Vị trí (số thực) để chèn 1 phần tử vào giữa 2 hàng xóm khi kéo-thả — dùng chung
 * cho List/Card reorder. Chỉ phần tử được kéo cần tính lại `position`, các phần
 * tử khác giữ nguyên số đang có (xem `list.service.ts` cũ, hàm
 * `reorderListOptimistic`, đã tách ra đây).
 */
export function midpoint(before: number | undefined, after: number | undefined): number {
  if (before === undefined) return (after ?? 1) - 1; // thả lên đầu
  if (after === undefined) return before + 1; // thả xuống cuối
  return (before + after) / 2; // chèn vào giữa
}
