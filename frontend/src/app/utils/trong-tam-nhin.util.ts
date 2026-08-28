/** Phần dọc của một hình chữ nhật — chỉ cần bấy nhiêu để quyết định có cuộn không. */
export interface DoanDoc {
  top: number;
  bottom: number;
}

/**
 * Phần tử có đang nằm trọn trong khung nhìn không?
 *
 * Tách khỏi component để test được: `scrollIntoView` và `getBoundingClientRect`
 * đều không có thật trong môi trường test, nên nếu luật này nằm lẫn trong
 * component thì chỉ còn cách thử tay.
 *
 * Dùng cho việc bấm vào ô trích dẫn: nằm trọn trong khung thì chỉ cần nháy sáng
 * tại chỗ; ló ra ngoài dù chỉ một phần thì cuộn tới rồi mới nháy — nháy một tin
 * mà người dùng không nhìn thấy thì chẳng khác gì không làm gì.
 */
export function trongTamNhin(phanTu: DoanDoc, khung: DoanDoc, le = 8): boolean {
  const cao = phanTu.bottom - phanTu.top;
  const khungCao = khung.bottom - khung.top;

  // Tin dài hơn cả khung thì không bao giờ "nằm trọn" được. Coi là đang xem nó
  // khi nó phủ kín khung — nếu không, một tin dài luôn bị cuộn lại vô ích.
  if (cao >= khungCao) {
    return phanTu.top <= khung.top && phanTu.bottom >= khung.bottom;
  }

  return phanTu.top >= khung.top + le && phanTu.bottom <= khung.bottom - le;
}
