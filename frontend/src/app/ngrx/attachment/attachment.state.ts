export interface AttachmentExtraState {
  /** Thời điểm nạp gần nhất theo thẻ (ms) — có mặt trong map tức là thẻ đã mở
   *  ít nhất 1 lần (dùng để lọc sự kiện WebSocket), giá trị dùng để biết link
   *  ký sắp hết hạn chưa. */
  loadedAt: Record<string, number>;
  uploading: boolean;
}

export const initialAttachmentState: AttachmentExtraState = {
  loadedAt: {},
  uploading: false,
};
