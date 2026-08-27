import { ConfigService } from '@nestjs/config';

/**
 * Đọc một biến môi trường, coi CHUỖI RỖNG là CHƯA ĐẶT.
 *
 * ⚠️ Đây là chỗ đã có lỗi thật. File `.env` mẫu để sẵn những dòng trống cho
 *    người dùng điền vào:
 *
 *        MODERATION_GEMINI_API_KEY=
 *
 *    `ConfigService.get()` trả về chuỗi rỗng `''` cho dòng đó — KHÔNG phải
 *    `undefined`. Mà `??` chỉ rơi sang vế sau khi gặp `null`/`undefined`, nên
 *    `get('MODERATION_GEMINI_API_KEY') ?? get('GEMINI_API_KEY')` dừng ngay ở
 *    chuỗi rỗng và không bao giờ dùng tới khoá dự phòng.
 *
 *    Hệ quả lúc đó: nhà cung cấp tự tắt, và vì đang fail-closed nên MỌI ảnh
 *    tải lên bị từ chối — chỉ vì một dòng để trống trong file cấu hình.
 *
 * Trong `.env`, `FOO=` mang nghĩa "chưa đặt". Hàm này làm đúng nghĩa đó.
 */
export function docCauHinh(
  config: ConfigService,
  ...ten: string[]
): string | undefined {
  for (const t of ten) {
    const v = config.get<string>(t)?.trim();
    if (v) return v;
  }
  return undefined;
}
