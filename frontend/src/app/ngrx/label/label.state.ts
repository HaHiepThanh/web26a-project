/** Bảng màu cho phép khi tự tạo nhãn — loại trừ đỏ/vàng/xám vì 3 màu đó đã
 *  khoá riêng cho mức ưu tiên, tránh nhầm lẫn ý nghĩa giữa nhãn và cờ ưu tiên. */
export const LABEL_COLOR_PALETTE = ['#2563eb', '#059669', '#7c3aed', '#0d9488', '#db2777', '#4f46e5', '#0891b2', '#65a30d'];

export interface LabelExtraState {
  /** Board đang có nhãn nạp trong bộ nhớ — tránh gọi lại API mỗi lần mở lại cùng board. */
  loadedBoardId: string | null;

  /**
   * cardId -> danh sách labelId — quan hệ NHIỀU-NHIỀU, đúng bảng `card_labels`.
   *
   * KHÔNG nhét mảng nhãn vào bên trong entity thẻ: một nhãn dùng ở 20 thẻ, nhân
   * bản ra 20 chỗ thì đổi tên nhãn phải sửa 20 nơi. Giữ ở đây làm "bảng nối"
   * riêng, tách khỏi `withEntities<Label>()` (nhãn của board).
   *
   * Chỉ được điền dần qua attach/detach/sự kiện WebSocket — backend chưa có
   * endpoint đọc `card_labels` của cả board cùng lúc.
   */
  cardLabelIds: Record<string, string[]>;
}

export const initialLabelState: LabelExtraState = {
  loadedBoardId: null,
  cardLabelIds: {},
};
