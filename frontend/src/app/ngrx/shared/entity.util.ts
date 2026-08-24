/**
 * Helper thuần dùng chung cho mọi store — không giữ state, không inject gì.
 *
 * ⚠️ Ba bạn từng viết ba bản khác nhau của file này, trong đó `withId` mang HAI
 *    nghĩa trái ngược (một bên là predicate cho `.find()`, một bên là thêm id
 *    vào `Set`). Bản hợp nhất dưới đây theo đúng hợp đồng đã ghi trong tài liệu
 *    bàn giao. Muốn thêm helper mới thì sửa Ở ĐÂY, đừng tự tạo bản riêng.
 */

/** Thêm 1 id vào `ReadonlySet` — luôn trả bản sao mới để signal nhận ra đã đổi. */
export function withId(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  return new Set(set).add(id);
}

/** Bớt 1 id khỏi `ReadonlySet` — luôn trả bản sao mới để signal nhận ra đã đổi. */
export function withoutId(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const copy = new Set(set);
  copy.delete(id);
  return copy;
}

/**
 * Gom một mảng phẳng thành `Record<khoá, phần tử[]>` — dùng ở tầng `withComputed`.
 *
 * Trả `Record` chứ không phải `Map` vì template Angular đọc `obj[key]` trực tiếp
 * được, còn `Map` thì phải gọi `.get()` — không dùng được trong biểu thức template.
 */
export function groupBy<T, K extends string>(
  items: readonly T[],
  key: (item: T) => K,
): Record<K, T[]> {
  const map = {} as Record<K, T[]>;
  for (const item of items) {
    const k = key(item);
    (map[k] ??= []).push(item);
  }
  return map;
}

/**
 * `position` để chèn 1 phần tử vào giữa hai hàng xóm, KHÔNG đánh số lại cả danh
 * sách. `position` là số thực (double precision) chính vì mục đích này.
 *
 * Nhận thẳng hai con số chứ không nhận object: chỗ gọi tự lấy `?.position` ra,
 * nhờ vậy dùng được cho cả list lẫn card mà không cần hai phiên bản.
 */
export function midpoint(before: number | undefined, after: number | undefined): number {
  if (before === undefined) return (after ?? 1) - 1; // thả lên đầu
  if (after === undefined) return before + 1; // thả xuống cuối
  return (before + after) / 2; // chèn vào giữa
}
