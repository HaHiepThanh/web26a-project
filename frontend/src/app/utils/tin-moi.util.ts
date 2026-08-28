import { Message } from '../models';

/**
 * Những tin MỚI HƠN một mốc thời gian.
 *
 * ⚠️ Neo vào THỜI GIAN chứ không phải SỐ LƯỢNG. Bản trước dùng
 * `list.slice(soLuongDaXet)`, đúng khi tin chỉ được thêm vào cuối. Từ khi có
 * phân trang thì tin cũ được chèn vào ĐẦU danh sách, nên `slice` cắt nhầm đúng
 * những tin mới nhất — vừa cuộn lên xem lịch sử là chuông báo "có 10 tin mới"
 * cho những câu đã đọc từ hôm kia.
 */
export function tinMoiHon(danhSach: Message[], moc: string): Message[] {
  if (!moc) return [];
  return danhSach.filter((m) => m.createdAt > moc);
}

/** Mốc mới = tin mới nhất trong danh sách; không bao giờ lùi lại. */
export function mocMoi(danhSach: Message[], mocCu: string): string {
  let max = mocCu;
  for (const m of danhSach) if (m.createdAt > max) max = m.createdAt;
  return max;
}
