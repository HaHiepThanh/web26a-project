/**
 * BỘ LỌC BOARD — NGUỒN SỰ THẬT DUY NHẤT.
 *
 * ⚠️ File này sinh ra vì đã có lỗi thật do chép đôi. Trước đây `board.ts` (nơi
 *    LỌC) và `board-header-bar.ts` (nơi BẤM) mỗi bên tự khai một bộ hằng số, và
 *    chúng lệch nhau:
 *
 *      board.ts        : '__unassigned__'  '__no_label__'   (chữ thường)
 *      board-header-bar: '__UNASSIGNED__'  '__NO_LABEL__'   (chữ HOA)
 *
 *    Hai chuỗi khác nhau nên phép so sánh không bao giờ khớp: bấm "Unassigned"
 *    hay "No labels" thì bộ lọc nhận một giá trị mà nó không hiểu, và kết quả
 *    trông như nút không hoạt động.
 *
 *    Thanh header còn tự thêm mốc 'no_due' mà `DateFilter` chưa hề có — TypeScript
 *    không bắt được vì output khai là `output<any>()`.
 *
 *    Nên: ai cần mấy thứ này thì IMPORT TỪ ĐÂY, đừng khai lại.
 */

/** Mốc lọc theo hạn. */
export type DateFilter = 'overdue' | 'today' | 'week' | 'no_due';

/** Nhãn hiển thị của từng mốc. Thứ tự ở đây là thứ tự nút trên giao diện. */
export const DATE_OPTIONS: { id: DateFilter; label: string }[] = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Today' },
  // Nhãn phải khớp phép lọc: `matchesDate` xét hôm nay tới hôm nay + 6 ngày,
  // tức đúng "7 ngày tới" chứ không phải "tuần này" (thứ Hai → Chủ nhật).
  { id: 'week', label: 'Next 7 days' },
  { id: 'no_due', label: 'No due date' },
];

/**
 * Sentinel cho "Chưa gán ai" và "Chưa có nhãn nào".
 *
 * Là chuỗi giả trộn chung mảng id thật, nên phải là thứ không thể trùng một id
 * thật. Firebase uid và uuid đều không chứa dấu gạch dưới.
 */
export const UNASSIGNED = '__unassigned__';
export const NO_LABEL = '__no_label__';


/**
 * Thẻ có khớp mốc lọc theo hạn không?
 *
 * Hàm THUẦN, tách khỏi trang Board để test được: đây chính là chỗ đã hỏng —
 * 'no_due' không có nhánh nào nên rơi xuống nhánh cuối và trả về thẻ đến hạn
 * trong 7 ngày tới, tức ngược hẳn với nút người dùng vừa bấm.
 *
 * @param dueDate hạn của thẻ, dạng 'YYYY-MM-DD'; rỗng/null = chưa đặt hạn
 * @param today   hôm nay, cùng dạng 'YYYY-MM-DD'
 */
export function khopMocHan(
  dueDate: string | null | undefined,
  mode: DateFilter,
  today: string,
): boolean {
  // PHẢI xét trước cái chặn bên dưới: "chưa có hạn" chính là những thẻ mà
  // `if (!dueDate) return false` loại đi.
  if (mode === 'no_due') return !dueDate;
  if (!dueDate) return false;

  if (mode === 'overdue') return dueDate < today;
  if (mode === 'today') return dueDate === today;

  // 'week' = hôm nay tới hôm nay + 6 ngày (bảy ngày kể cả hôm nay), khớp nhãn
  // "Next 7 days". So sánh chuỗi 'YYYY-MM-DD' là so đúng thứ tự thời gian và
  // tránh hẳn chuyện `new Date('2026-09-01')` bị hiểu theo UTC rồi lệch ngày
  // với người ở múi giờ dương.
  const het = new Date(`${today}T00:00:00`);
  het.setDate(het.getDate() + 6);
  const p = (n: number) => String(n).padStart(2, '0');
  const hetChuoi = `${het.getFullYear()}-${p(het.getMonth() + 1)}-${p(het.getDate())}`;
  return dueDate >= today && dueDate <= hetChuoi;
}
