/**
 * Các nhóm nội dung bị chặn.
 *
 * Đặt tên theo NGHĨA chứ không theo tên nhãn của một nhà cung cấp cụ thể: Vision
 * gọi là `adult`, Gemini trả về nhãn khác, còn nếu mai đổi sang Rekognition thì
 * lại là `Explicit Nudity`. Quy hết về một bộ tên của riêng mình thì đổi nhà
 * cung cấp là sửa đúng lớp adapter, không phải sửa khắp nơi.
 */
export type NhomViPham =
  | 'khieu_dam' // ảnh khoả thân, hành vi tình dục
  | 'goi_duc' // hở hang, tạo dáng gợi dục (mức nhẹ hơn)
  | 'bao_luc' // đánh đập, tra tấn, cảnh bạo lực
  | 'mau_me' // máu me, thương tích, xác chết
  | 'vu_khi' // súng, dao, chất nổ dùng để đe doạ
  | 'ma_tuy' // chất cấm, dụng cụ sử dụng
  | 'thu_ghet' // biểu tượng thù ghét, cực đoan
  | 'tu_hai' // tự gây thương tích, tự tử
  | 'gay_soc'; // ảnh gây sốc, ghê rợn nói chung

/** Nhãn hiển thị cho người dùng — không lộ tên kỹ thuật. */
export const TEN_NHOM: Record<NhomViPham, string> = {
  khieu_dam: 'sexual content',
  goi_duc: 'suggestive content',
  bao_luc: 'violence',
  mau_me: 'graphic injury',
  vu_khi: 'weapons',
  ma_tuy: 'drugs',
  thu_ghet: 'hate symbols',
  tu_hai: 'self-harm',
  gay_soc: 'disturbing content',
};

/**
 * Mức độ, thang 0-3.
 *
 * Cố ý khớp với thang `likelihood` của Vision SafeSearch để lớp adapter chỉ là
 * phép ánh xạ thẳng, không phải quy đổi lắt léo:
 *   0 = rất khó xảy ra   1 = có thể   2 = nhiều khả năng   3 = gần như chắc chắn
 */
export type MucDo = 0 | 1 | 2 | 3;

/** Chặn từ mức này trở lên — tương đương LIKELY của SafeSearch. */
export const NGUONG_CHAN: MucDo = 2;

export interface KetQuaKiemDuyet {
  choPhep: boolean;
  /** Những nhóm đã VƯỢT ngưỡng. Rỗng khi ảnh sạch. */
  viPham: NhomViPham[];
  /** Điểm từng nhóm — ghi log để về sau còn chỉnh ngưỡng cho đúng. */
  diem: Partial<Record<NhomViPham, MucDo>>;
  /** Nhà cung cấp nào đã cho ra kết luận này. */
  nguon: string[];
  /** Có nhà cung cấp nào hỏng không — quyết định fail-closed. */
  coLoi: boolean;
}

/** Hợp đồng chung cho mọi nhà cung cấp kiểm duyệt. */
export interface NhaCungCapKiemDuyet {
  readonly ten: string;
  readonly bat: boolean;
  /** Ném lỗi khi gọi hỏng — `ModerationService` bắt và xử theo fail-closed. */
  cham(buffer: Buffer, mime: string): Promise<Partial<Record<NhomViPham, MucDo>>>;
}
