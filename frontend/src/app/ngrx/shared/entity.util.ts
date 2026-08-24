/** Helper dùng chung cho state có dạng entity phẳng (`withEntities`). */

/** Thêm 1 id vào `ReadonlySet` — luôn trả về bản sao mới để signal nhận ra đã đổi. */
export function withId(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  return new Set(set).add(id);
}

/** Bớt 1 id khỏi `ReadonlySet` — luôn trả về bản sao mới để signal nhận ra đã đổi. */
export function withoutId(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const copy = new Set(set);
  copy.delete(id);
  return copy;
}

/** Gom một mảng phẳng thành `Record<khoá, phần tử[]>` — dùng ở tầng `withComputed`. */
export function groupBy<T, K extends string>(items: readonly T[], key: (item: T) => K): Record<K, T[]> {
  const map = {} as Record<K, T[]>;
  for (const item of items) {
    const k = key(item);
    (map[k] ??= []).push(item);
  }
  return map;
}

/**
 * `position` để chèn 1 phần tử vào giữa hai hàng xóm, không phải đánh số lại cả
 * danh sách. `position` là số thực (double precision) chính vì mục đích này.
 */
export function midpoint(
  before: { position: number } | undefined,
  after: { position: number } | undefined,
): number {
  if (!before) return (after?.position ?? 1) - 1;
  if (!after) return before.position + 1;
  return (before.position + after.position) / 2;
}
