import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MucDo, NhaCungCapKiemDuyet, NhomViPham } from './moderation.types';
import { docCauHinh } from './cau-hinh.util';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 12000;

/**
 * Gemini chấm ĐỦ CẢ CHÍN NHÓM.
 *
 * ⚠️ Bản đầu chỉ cho Gemini chấm 6 nhóm mở rộng, phần `khieu_dam`/`goi_duc`/
 *    `bao_luc` để Vision lo. Đó là một lỗi thiết kế: nó ngầm coi Vision LUÔN
 *    có mặt. Thực tế Vision đòi bật thanh toán trên Google Cloud, nên rất dễ
 *    rơi vào cảnh chỉ có Gemini — và khi đó BA NHÓM QUAN TRỌNG NHẤT không ai
 *    kiểm, trong khi log vẫn báo "Kiểm duyệt ảnh: BẬT" như thể mọi thứ ổn.
 *
 *    Nay mỗi nhà cung cấp đều tự đứng được một mình. Có Vision thì nó chấm
 *    chồng lên ba nhóm cốt lõi và lấy điểm cao hơn — thêm chính xác, không
 *    phải thêm phạm vi.
 */
const NHOM_TAT_CA: NhomViPham[] = [
  'khieu_dam',
  'goi_duc',
  'bao_luc',
  'mau_me',
  'vu_khi',
  'ma_tuy',
  'thu_ghet',
  'tu_hai',
  'gay_soc',
];

/**
 * Chính Gemini cũng có bộ lọc an toàn riêng, và nó có thể TỪ CHỐI xử lý ảnh
 * quá nhạy cảm. Khi đó model không trả về điểm nào cả.
 *
 * Một lời từ chối như vậy KHÔNG phải lỗi — nó là bằng chứng mạnh rằng ảnh có
 * vấn đề. Bản đầu coi đó là lỗi gọi API, nên kết cục vẫn chặn (nhờ fail-closed)
 * nhưng báo cho người dùng câu sai: "không kiểm được" thay vì "ảnh vi phạm".
 */
const NHAN_AN_TOAN: Record<string, NhomViPham> = {
  HARM_CATEGORY_SEXUALLY_EXPLICIT: 'khieu_dam',
  HARM_CATEGORY_HATE_SPEECH: 'thu_ghet',
  HARM_CATEGORY_DANGEROUS_CONTENT: 'gay_soc',
  HARM_CATEGORY_HARASSMENT: 'gay_soc',
};

/**
 * Ép model trả về đúng JSON, không phải văn xuôi có kèm ```json.
 * Mỗi nhóm một số nguyên 0-3, cùng thang với `MucDo`.
 */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: Object.fromEntries(NHOM_TAT_CA.map((n) => [n, { type: 'INTEGER' }])),
  required: NHOM_TAT_CA,
};

/**
 * Gemini đọc ảnh — lớp MỞ RỘNG THỂ LOẠI.
 *
 * ─── VÌ SAO KHÔNG ĐỂ GEMINI QUYẾT ĐỊNH LUÔN CHUYỆN KHIÊU DÂM ───
 *
 * Gemini là model đa năng, không phải mô hình an toàn chuyên dụng: nó không có
 * số liệu độ chính xác công bố cho việc này, và ở những ca sát ngưỡng thì cùng
 * một ảnh có thể cho hai câu trả lời khác nhau. SafeSearch được huấn luyện đúng
 * cho `adult`/`racy`/`violence` và đã hiệu chuẩn thang likelihood.
 *
 * Nên chia việc: SafeSearch giữ ba nhóm cốt lõi, Gemini lo sáu nhóm mà
 * SafeSearch không có (máu me, vũ khí, ma tuý, thù ghét, tự hại, gây sốc).
 * Hai bên chạy SONG SONG nên độ trễ là cái chậm hơn, không phải tổng.
 *
 * Dùng lại đúng `GEMINI_API_KEY` đã có sẵn trong dự án — không phải dựng thêm
 * tài khoản hay khoá nào.
 */
@Injectable()
export class GeminiVisionProvider implements NhaCungCapKiemDuyet {
  readonly ten = 'gemini-vision';
  private readonly logger = new Logger(GeminiVisionProvider.name);
  private readonly apiKey: string | undefined;
  private readonly model: string;

  constructor(config: ConfigService) {
    // Khoá RIÊNG cho kiểm duyệt, rơi về khoá chung nếu không khai.
    //
    // ⚠️ Vì sao nên tách: kiểm duyệt ảnh và gợi ý tạo thẻ dùng chung một khoá
    //    thì chúng ĂN CHUNG một hạn mức tần suất. Đã đo được thật: chạy trọn bộ
    //    kiểm tra một lượt là những lời gọi gợi ý thẻ bắt đầu chạm timeout 30
    //    giây, dù bản thân chúng không có lỗi gì. Trong production, vài người
    //    cùng tải ảnh lên trong lúc khung chat đang hoạt động là đủ để gợi ý
    //    thẻ im lặng chết.
    //
    //    Khoá thuộc PROJECT KHÁC thì có hạn mức riêng, nên tách được là tách.
    // `docCauHinh` coi chuỗi rỗng là chưa đặt — `??` thì không, và dòng
    // `MODERATION_GEMINI_API_KEY=` để trống từng làm tắt cả nhà cung cấp.
    this.apiKey = docCauHinh(config, 'MODERATION_GEMINI_API_KEY', 'GEMINI_API_KEY');
    // Model riêng cho kiểm duyệt, tách khỏi `GEMINI_MODEL` của phần gợi ý thẻ:
    // hai việc có yêu cầu khác nhau và có thể cần đổi model độc lập.
    this.model =
      docCauHinh(config, 'MODERATION_GEMINI_MODEL', 'GEMINI_MODEL') ??
      'gemini-3.5-flash-lite';
  }

  get bat(): boolean {
    return !!this.apiKey;
  }

  async cham(buffer: Buffer, mime: string): Promise<Partial<Record<NhomViPham, MucDo>>> {
    const controller = new AbortController();
    const hen = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}/${this.model}:generateContent`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          // Key đi trong HEADER, không phải query string: query string bị ghi
          // vào log của proxy, mà đây là khoá tính tiền.
          'x-goog-api-key': this.apiKey as string,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: this.prompt() }] },
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: mime, data: buffer.toString('base64') } },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            // Đây là việc PHÂN LOẠI, không phải sáng tác: cùng một ảnh phải cho
            // ra cùng một kết quả.
            temperature: 0,
            maxOutputTokens: 256,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      }

      const data = (await res.json()) as {
        candidates?: {
          content?: { parts?: { text?: string }[] };
          finishReason?: string;
          safetyRatings?: { category?: string; probability?: string }[];
        }[];
        promptFeedback?: {
          blockReason?: string;
          safetyRatings?: { category?: string; probability?: string }[];
        };
      };

      // Gemini TỪ CHỐI xử lý vì bộ lọc an toàn của chính nó → đó là KẾT LUẬN,
      // không phải lỗi. Coi là lỗi thì fail-closed vẫn chặn đúng, nhưng người
      // dùng nhận câu sai ("không kiểm được" thay vì "ảnh vi phạm").
      const canh = data.candidates?.[0];
      const bịChan =
        !!data.promptFeedback?.blockReason || canh?.finishReason === 'SAFETY';
      if (bịChan) {
        const nhan = [
          ...(data.promptFeedback?.safetyRatings ?? []),
          ...(canh?.safetyRatings ?? []),
        ];
        const ra: Partial<Record<NhomViPham, MucDo>> = {};
        for (const r of nhan) {
          const nhom = NHAN_AN_TOAN[r.category ?? ''];
          // Chỉ lấy nhãn thực sự cao; Gemini trả về CẢ những nhãn mức
          // NEGLIGIBLE cho mọi ảnh, gom hết vào là ảnh nào cũng vi phạm.
          if (nhom && (r.probability === 'HIGH' || r.probability === 'MEDIUM')) {
            ra[nhom] = 3;
          }
        }
        // Bị chặn mà không nhãn nào đủ cao để quy trách nhiệm — vẫn phải chặn,
        // ghi vào nhóm chung nhất.
        if (Object.keys(ra).length === 0) ra.gay_soc = 3;
        this.logger.warn(
          `Gemini từ chối xử lý ảnh (bộ lọc an toàn) → coi là vi phạm: ${Object.keys(ra).join(', ')}`,
        );
        return ra;
      }

      const text = canh?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Phản hồi không có phần nội dung');

      const tho = JSON.parse(text) as Record<string, unknown>;
      const ra: Partial<Record<NhomViPham, MucDo>> = {};
      for (const n of NHOM_TAT_CA) {
        // KIỂM TRA LẠI đầu ra của model, không tin thẳng: schema chỉ ép kiểu
        // INTEGER, không ép khoảng giá trị. Model trả 7 hay -1 đều lọt qua
        // schema rồi làm hỏng phép so ngưỡng.
        const v = Number(tho[n]);
        ra[n] = (Number.isFinite(v) ? Math.min(3, Math.max(0, Math.round(v))) : 0) as MucDo;
      }
      return ra;
    } finally {
      clearTimeout(hen);
    }
  }

  private prompt(): string {
    return [
      'Bạn là bộ kiểm duyệt ảnh cho một ứng dụng quản lý công việc dùng trong trường học.',
      'Chấm ảnh được đưa vào theo từng nhóm dưới đây, mỗi nhóm một số nguyên 0-3:',
      '',
      '  0 = không có dấu hiệu',
      '  1 = có thể có, không rõ ràng',
      '  2 = nhiều khả năng có',
      '  3 = gần như chắc chắn có',
      '',
      'CÁC NHÓM:',
      '  khieu_dam — khoả thân, bộ phận sinh dục, hành vi tình dục, nội dung khiêu dâm',
      '  goi_duc   — hở hang, tạo dáng gợi dục, đồ lót/bikini trong ngữ cảnh gợi dục',
      '  bao_luc   — đánh đập, tra tấn, hành hung, cảnh chiến sự đẫm máu',
      '  mau_me   — máu, vết thương hở, xác chết, cảnh phẫu thuật ghê rợn',
      '  vu_khi   — súng, dao, chất nổ ở tư thế đe doạ hoặc phô trương',
      '  ma_tuy   — chất cấm, dụng cụ sử dụng ma tuý',
      '  thu_ghet — biểu tượng thù ghét, phát xít, cực đoan, kỳ thị',
      '  tu_hai   — tự gây thương tích, cổ vũ tự tử',
      '  gay_soc  — ảnh ghê rợn, kinh dị, gây khó chịu mạnh',
      '',
      'NGUYÊN TẮC:',
      '  • Ảnh chụp màn hình phần mềm, sơ đồ, biểu đồ, ảnh nhóm, phong cảnh → tất cả là 0.',
      '  • Hình minh hoạ/biểu tượng nhỏ trong giao diện (icon dao kéo, icon cảnh báo)',
      '    KHÔNG phải vi phạm — chấm 0. Chỉ chấm cao khi ảnh THẬT SỰ phô bày nội dung đó.',
      '  • Ảnh y khoa, giáo dục, tư liệu lịch sử → chấm thấp, đây là nội dung hợp lệ.',
      '  • Ảnh đi biển, thể thao, bơi lội bình thường KHÔNG phải goi_duc — chấm 0 hoặc 1.',
      '    Chỉ chấm cao khi tư thế/khung hình rõ ràng nhằm gợi dục.',
      '  • Không chắc thì chấm THẤP. Chặn nhầm ảnh công việc gây phiền hơn là bỏ sót',
      '    một ảnh mà lớp kiểm tra kia vẫn có cơ hội bắt.',
    ].join('\n');
  }
}
