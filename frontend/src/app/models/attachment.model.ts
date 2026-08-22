// Tập tin/hình đính kèm trong 1 thẻ — lưu THẬT trên Supabase Storage.
export interface Attachment {
  id: string;
  cardId: string;
  name: string; // tên tệp gốc
  mimeType: string; // vd 'image/png', 'application/pdf'
  /**
   * Link tải CÓ CHỮ KÝ, hết hạn sau 1 giờ.
   *
   * ⚠️ Đừng lưu link này xuống localStorage rồi dùng lại hôm sau — nó chết. Mở
   *    lại thẻ thì gọi `loadAttachments()` để backend cấp link mới. Trước đây
   *    trường này là `dataUrl` chứa base64 nên dùng mãi cũng được; giờ thì không.
   */
  url: string | null;
  size: number; // bytes
  isImage: boolean;
  isCover: boolean; // ảnh bìa của thẻ (chỉ 1 ảnh làm bìa)
  uploadedBy: string; // Firebase uid người tải lên
  createdAt: string; // ISO timestamptz
}
