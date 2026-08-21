// Hình học của 1 cột trên bản đồ thu nhỏ (minimap) của trang Board.
//
// `offset` và `size` là TỈ LỆ so với tổng bề rộng vùng cuộn (0..1), không phải
// pixel — nhờ vậy minimap tự co giãn theo kích thước màn hình mà không phải
// tính lại khi cửa sổ đổi kích thước.
export interface MinimapListGeom {
  id: string;
  name: string;
  cardCount: number;
  offset: number;
  size: number;
}
