// Tập tin/hình đính kèm trong 1 thẻ (card detail). Demo: lưu base64 tại chỗ, chưa có
// backend/Storage thật (không có upload server) — đủ để xem trước & mở ảnh/tệp.
export interface Attachment {
  id: string;
  cardId: string;
  name: string; // tên tệp gốc
  mimeType: string; // vd 'image/png', 'application/pdf'
  dataUrl: string; // base64 data URL — nguồn để hiển thị/mở
  size: number; // bytes
  isImage: boolean;
  isCover: boolean; // ảnh bìa của thẻ (chỉ 1 ảnh làm bìa)
  createdAt: string; // ISO timestamptz
}
