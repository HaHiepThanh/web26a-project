import { ConfigService } from '@nestjs/config';
import { GeminiVisionProvider } from './gemini-vision.provider';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function dung(): GeminiVisionProvider {
  const config = {
    get: (k: string) => (k === 'GEMINI_API_KEY' ? 'khoa-gia' : undefined),
  };
  return new GeminiVisionProvider(config as unknown as ConfigService);
}

function traLoi(body: unknown, ok = true, status = 200) {
  (global as unknown as { fetch: unknown }).fetch = jest
    .fn()
    .mockResolvedValue({ ok, status, json: async () => body, text: async () => '' });
}

/** Phản hồi bình thường: model trả JSON điểm từng nhóm. */
const diem = (o: Record<string, number>) => ({
  candidates: [
    { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(o) }] } },
  ],
});

describe('GeminiVisionProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('chấm ĐỦ CHÍN nhóm, không chỉ sáu nhóm mở rộng', async () => {
    // Bản đầu để `khieu_dam`/`goi_duc`/`bao_luc` cho Vision lo. Vision đòi bật
    // thanh toán nên rất dễ vắng mặt — khi đó ba nhóm quan trọng nhất không ai
    // kiểm, trong khi log vẫn báo "BẬT".
    traLoi(diem({}));
    const ra = await dung().cham(PNG, 'image/png');
    expect(Object.keys(ra).sort()).toEqual(
      ['bao_luc', 'gay_soc', 'goi_duc', 'khieu_dam', 'ma_tuy', 'mau_me', 'thu_ghet', 'tu_hai', 'vu_khi'],
    );
  });

  it('đọc đúng điểm model trả về', async () => {
    traLoi(diem({ khieu_dam: 3, bao_luc: 1 }));
    const ra = await dung().cham(PNG, 'image/png');
    expect(ra.khieu_dam).toBe(3);
    expect(ra.bao_luc).toBe(1);
  });

  it('kẹp điểm ngoài khoảng 0-3 về đúng khoảng', async () => {
    // `responseSchema` chỉ ép kiểu INTEGER, KHÔNG ép khoảng giá trị — model trả
    // 7 hay -1 đều lọt qua schema rồi làm hỏng phép so ngưỡng.
    traLoi(diem({ khieu_dam: 7, bao_luc: -1, gay_soc: 2.6 }));
    const ra = await dung().cham(PNG, 'image/png');
    expect(ra.khieu_dam).toBe(3);
    expect(ra.bao_luc).toBe(0);
    expect(ra.gay_soc).toBe(3);
  });

  it('giá trị rác trả về 0 thay vì NaN', async () => {
    traLoi(diem({ khieu_dam: 'ba' as unknown as number }));
    const ra = await dung().cham(PNG, 'image/png');
    expect(ra.khieu_dam).toBe(0);
  });

  describe('Gemini TỪ CHỐI xử lý (bộ lọc an toàn của chính nó)', () => {
    it('promptFeedback.blockReason → coi là VI PHẠM, không phải lỗi', async () => {
      // Một lời từ chối như vậy là bằng chứng mạnh, không phải sự cố gọi API.
      traLoi({
        promptFeedback: {
          blockReason: 'SAFETY',
          safetyRatings: [
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', probability: 'HIGH' },
          ],
        },
      });
      const ra = await dung().cham(PNG, 'image/png');
      expect(ra.khieu_dam).toBe(3);
    });

    it('finishReason SAFETY cũng được xử như vậy', async () => {
      traLoi({
        candidates: [
          {
            finishReason: 'SAFETY',
            safetyRatings: [
              { category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'HIGH' },
            ],
          },
        ],
      });
      expect((await dung().cham(PNG, 'image/png')).thu_ghet).toBe(3);
    });

    it('bị chặn mà không nhãn nào đủ cao → vẫn chặn, quy về nhóm chung', async () => {
      traLoi({ promptFeedback: { blockReason: 'OTHER', safetyRatings: [] } });
      expect((await dung().cham(PNG, 'image/png')).gay_soc).toBe(3);
    });

    it('KHÔNG gom nhãn mức NEGLIGIBLE — Gemini trả nhãn đó cho MỌI ảnh', async () => {
      // Gom hết thì ảnh nào cũng thành vi phạm.
      traLoi({
        promptFeedback: {
          blockReason: 'SAFETY',
          safetyRatings: [
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', probability: 'NEGLIGIBLE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'LOW' },
          ],
        },
      });
      const ra = await dung().cham(PNG, 'image/png');
      expect(ra.khieu_dam).toBeUndefined();
      expect(ra.thu_ghet).toBeUndefined();
      expect(ra.gay_soc).toBe(3); // rơi về nhóm chung
    });
  });

  it('HTTP lỗi thì NÉM, để service xử theo fail-closed', async () => {
    traLoi({}, false, 429);
    await expect(dung().cham(PNG, 'image/png')).rejects.toThrow(/429/);
  });

  it('phản hồi không có nội dung và cũng không bị chặn → ném lỗi', async () => {
    traLoi({ candidates: [{ finishReason: 'STOP', content: { parts: [] } }] });
    await expect(dung().cham(PNG, 'image/png')).rejects.toThrow(/nội dung/);
  });

  it('thiếu GEMINI_API_KEY thì provider tự tắt', () => {
    const p = new GeminiVisionProvider({
      get: () => undefined,
    } as unknown as ConfigService);
    expect(p.bat).toBe(false);
  });
});
