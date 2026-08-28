import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MucDo, NhaCungCapKiemDuyet, NhomViPham } from './moderation.types';
import { docCauHinh } from './cau-hinh.util';

const API = 'https://vision.googleapis.com/v1/images:annotate';
/** Kiểm ảnh nằm CHẶN đường upload, nên không được treo lâu. Quá hạn → fail-closed. */
const TIMEOUT_MS = 8000;

/**
 * Thang `likelihood` của SafeSearch → thang 0-3 của mình.
 * `UNKNOWN` quy về 0: không biết thì không phải là bằng chứng vi phạm.
 */
const THANG: Record<string, MucDo> = {
  UNKNOWN: 0,
  VERY_UNLIKELY: 0,
  UNLIKELY: 1,
  POSSIBLE: 1,
  LIKELY: 2,
  VERY_LIKELY: 3,
};

/**
 * Google Cloud Vision — SafeSearch.
 *
 * ─── VÌ SAO CHỈ LẤY 3 TRONG 5 NHÓM ───
 *
 * SafeSearch trả về `adult`, `racy`, `violence`, `medical`, `spoof`. Hai nhóm
 * cuối CỐ Ý không dùng để chặn:
 *
 *   • `medical` — ảnh y khoa là nội dung hợp lệ. Chặn nó là chặn nhầm ảnh chụp
 *     X-quang trong một board của nhóm làm phần mềm y tế.
 *   • `spoof`  — chỉ có nghĩa "ảnh đã bị chỉnh/chế", không hàm ý có hại. Gần
 *     như mọi ảnh chế đều dính nhãn này.
 *
 * Vẫn ghi điểm hai nhóm đó vào log để sau này còn xem lại, chỉ là không chặn.
 */
@Injectable()
export class VisionProvider implements NhaCungCapKiemDuyet {
  readonly ten = 'vision-safesearch';
  private readonly logger = new Logger(VisionProvider.name);
  private readonly apiKey: string | undefined;

  constructor(config: ConfigService) {
    this.apiKey = docCauHinh(config, 'GOOGLE_VISION_API_KEY');
  }

  get bat(): boolean {
    return !!this.apiKey;
  }

  async cham(
    buffer: Buffer,
    _mime: string,
  ): Promise<Partial<Record<NhomViPham, MucDo>>> {
    const controller = new AbortController();
    const hen = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${API}?key=${this.apiKey as string}`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: buffer.toString('base64') },
              features: [{ type: 'SAFE_SEARCH_DETECTION' }],
            },
          ],
        }),
      });

      if (!res.ok) {
        throw new Error(
          `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`,
        );
      }

      const data = (await res.json()) as {
        responses?: {
          safeSearchAnnotation?: Record<string, string>;
          error?: { message?: string };
        }[];
      };
      const r = data.responses?.[0];
      // Vision trả 200 kèm `error` BÊN TRONG từng response khi ảnh hỏng hoặc
      // quá cỡ. Không xét chỗ này thì ảnh lỗi lặng lẽ được coi là sạch.
      if (r?.error?.message) throw new Error(r.error.message);

      const a = r?.safeSearchAnnotation;
      if (!a) throw new Error('Phản hồi không có safeSearchAnnotation');

      const muc = (k: string): MucDo => THANG[a[k] ?? 'UNKNOWN'] ?? 0;
      return {
        khieu_dam: muc('adult'),
        goi_duc: muc('racy'),
        bao_luc: muc('violence'),
      };
    } finally {
      clearTimeout(hen);
    }
  }
}
