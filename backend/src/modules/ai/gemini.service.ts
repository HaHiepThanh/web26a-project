import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DetectTasksInput,
  DetectTasksResult,
  SuggestedCard,
} from './gemini.types';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Dưới ngưỡng này thì coi như không phải giao việc — thà bỏ sót còn hơn làm phiền. */
const NGUONG_TU_TIN = 0.55;

/** Cắt bớt để một tin nhắn dài bất thường không thổi phồng lượt gọi. */
const MAX_CONTENT = 2000;

/** Gọi model quá lâu thì bỏ — gợi ý là việc phụ, không được treo tài nguyên. */
const TIMEOUT_MS = 30_000;

const DINH_DANG_NGAY = /^\d{4}-\d{2}-\d{2}$/;
const MUC_UU_TIEN = ['high', 'medium', 'low'] as const;

/**
 * Schema BẮT BUỘC model trả đúng JSON — không bao giờ phải bóc chuỗi từ văn xuôi.
 *
 * Gemini nhận `responseSchema` theo tập con của OpenAPI. Có schema rồi thì kết
 * quả luôn parse được; thiếu nó là thỉnh thoảng model trả kèm ```json rồi giải
 * thích thêm vài câu, và `JSON.parse` vỡ.
 */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    isTask: { type: 'boolean' },
    confidence: { type: 'number' },
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          assigneeId: { type: 'string' },
          dueDate: { type: 'string' },
          listId: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['title'],
      },
    },
  },
  required: ['isTask', 'confidence', 'cards'],
} as const;

/**
 * Từ khoá cho BỘ LỌC RẺ — chạy trước, bằng regex, không tốn lượt gọi model.
 *
 * ⚠️ Phải có CẢ tiếng Việt lẫn tiếng Anh. Thiếu nhóm tiếng Anh thì mọi tin nhắn
 *    tiếng Anh bị chặn ngay từ đây và không bao giờ tới được Gemini — mà nhóm
 *    này chat trộn hai thứ tiếng là chuyện bình thường.
 */
const TU_KHOA_GIAO_VIEC = [
  // Việt
  'làm',
  'lam',
  'fix',
  'sửa',
  'sua',
  'giúp',
  'giup',
  'xong',
  'hoàn thành',
  'deadline',
  'hạn',
  'han',
  'gấp',
  'gap',
  'nhớ',
  'nho',
  'cần',
  'can',
  'phụ trách',
  'nhận',
  'triển khai',
  'viết',
  'viet',
  'kiểm tra',
  'test',
  // Anh
  'do ',
  'build',
  'help',
  'finish',
  'handle',
  'take',
  'implement',
  'write',
  'review',
  'check',
  'ship',
  'deploy',
  'refactor',
  'assign',
  'work on',
  'can you',
  'could you',
  'please',
  'need to',
  "let's",
  'lets ',
];

const TU_KHOA_THOI_GIAN = [
  // Việt
  'hôm nay',
  'hom nay',
  'ngày mai',
  'ngay mai',
  'mai',
  'mốt',
  'tuần',
  'tuan',
  'thứ 2',
  'thứ 3',
  'thứ 4',
  'thứ 5',
  'thứ 6',
  'thứ 7',
  'chủ nhật',
  'thu 2',
  'thu 3',
  'thu 4',
  'thu 5',
  'thu 6',
  'thu 7',
  'chu nhat',
  'trước',
  'truoc',
  'cuối tuần',
  'cuoi tuan',
  // Anh
  'today',
  'tomorrow',
  'tonight',
  'this week',
  'next week',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'eod',
  'asap',
  'by ',
  'before ',
  'deadline',
];

/** Tin ngắn hơn ngần này gần như chắc chắn không phải giao việc ("ok", "ừ", "lol"). */
const DO_DAI_TOI_THIEU = 15;

/**
 * PHÂN TÍCH TIN NHẮN CHAT BẰNG GEMINI — nơi DUY NHẤT gọi Gemini API.
 *
 * Key nằm ở backend (`GEMINI_API_KEY`), không bao giờ ở frontend. Frontend chỉ
 * nhận kết quả đã được kiểm tra lại.
 *
 * ── Vì sao gọi REST bằng `fetch` chứ không cài SDK?
 * Request `generateContent` rất đơn giản và ổn định, còn tên model thì nằm ở biến
 * môi trường nên đổi model là đổi cấu hình chứ không phải sửa code. Thêm một SDK
 * chỉ để gửi một POST là thêm một thứ phải nâng cấp theo.
 *
 * Việc để tên model ở env đã có ích ngay hai lần:
 *   1. `gemini-2.5-flash` tuy vẫn nằm trong danh sách model của key nhưng Google
 *      đã ngừng cấp cho tài khoản mới, trả 404 kèm lời nhắn đổi sang bản mới.
 *   2. `gemini-3.6-flash` chạy đúng nhưng mất ~28 giây/lượt vì nó "suy nghĩ" rất
 *      lâu — quá chậm cho một gợi ý trong khung chat.
 *
 * Chốt lại `gemini-3.5-flash-lite`: đo thực tế 1–2 giây, và trên 3 kịch bản
 * (Việt / Anh / trộn hai thứ tiếng) cho kết quả đúng y hệt bản đầy đủ.
 *
 * ── Vì sao KHÔNG `getOrThrow` trong constructor?
 * Bản trước làm vậy với `ANTHROPIC_API_KEY`, và vì NestJS khởi tạo mọi provider
 * lúc bật app nên THIẾU KEY LÀ CẢ BACKEND KHÔNG CHẠY — cuối cùng phải tắt hẳn cả
 * module. Ở đây thiếu key thì `enabled = false`, chat vẫn chạy bình thường, chỉ
 * là không có gợi ý.
 */
@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly apiKey: string | undefined;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('GEMINI_API_KEY');
    this.model = config.get<string>('GEMINI_MODEL') ?? 'gemini-3.5-flash-lite';
    if (!this.apiKey) {
      this.logger.warn(
        'Thiếu GEMINI_API_KEY — tính năng gợi ý tạo thẻ TẮT. Chat vẫn hoạt động bình thường.',
      );
    }
  }

  get enabled(): boolean {
    return !!this.apiKey;
  }

  get modelName(): string {
    return this.model;
  }

  /**
   * BỘ LỌC RẺ — quyết định có đáng gọi model không, bằng regex thuần.
   *
   * Mỗi lượt gọi Gemini đều tốn quota và mất 1–3 giây. Phần lớn tin nhắn trong
   * một nhóm chat là "ok", "ừ", "xong rồi nhé" — lọc trước ở đây thì những tin
   * đó không bao giờ chạm tới model.
   */
  shouldAnalyze(content: string, memberNames: string[]): boolean {
    if (!this.enabled) return false;

    const text = content.trim();
    if (text.length < DO_DAI_TOI_THIEU) return false;

    const lower = text.toLowerCase();
    const coDongTu = TU_KHOA_GIAO_VIEC.some((k) => lower.includes(k));
    const coThoiGian = TU_KHOA_THOI_GIAN.some((k) => lower.includes(k));
    const coNhacTen =
      lower.includes('@') ||
      memberNames.some((n) => n && lower.includes(n.toLowerCase()));

    // Cần ít nhất HAI dấu hiệu. Chỉ một mình từ "làm" thì "hôm nay làm biếng quá"
    // cũng lọt, mà đó rõ ràng không phải giao việc.
    return [coDongTu, coThoiGian, coNhacTen].filter(Boolean).length >= 2;
  }

  /** Gọi model, rồi KIỂM TRA LẠI toàn bộ kết quả trước khi trả ra. */
  async detectTasks(input: DetectTasksInput): Promise<DetectTasksResult> {
    const rong: DetectTasksResult = { isTask: false, confidence: 0, cards: [] };
    if (!this.enabled) return rong;

    let raw: unknown;
    try {
      raw = await this.callModel(input);
    } catch (e) {
      // Model hỏng/hết quota/timeout đều KHÔNG được làm hỏng việc gửi tin nhắn.
      this.logger.warn(`Gọi Gemini thất bại: ${(e as Error).message}`);
      return rong;
    }

    return this.validate(raw, input);
  }

  // ------------------------------------------------------------------ nội bộ

  private async callModel(input: DetectTasksInput): Promise<unknown> {
    const url = `${API_BASE}/${this.model}:generateContent`;
    const controller = new AbortController();
    const hen = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          // Key đi trong HEADER, không phải query string: query string bị ghi vào
          // log của proxy, mà đây là khoá tính tiền.
          'x-goog-api-key': this.apiKey as string,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: this.systemPrompt() }] },
          contents: [
            { role: 'user', parts: [{ text: this.userPrompt(input) }] },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            // Nhiệt độ thấp: đây là việc TRÍCH XUẤT, không phải sáng tác. Cùng
            // một tin nhắn nên luôn ra cùng một kết quả.
            temperature: 0.1,
            maxOutputTokens: 2048,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(
          `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`,
        );
      }

      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Phản hồi không có phần nội dung');
      return JSON.parse(text);
    } finally {
      clearTimeout(hen);
    }
  }

  private systemPrompt(): string {
    return [
      'Bạn phân tích tin nhắn trong khung chat của một nhóm làm phần mềm (sinh viên Việt Nam),',
      'và trích ra các đầu việc cần tạo thành thẻ Kanban.',
      '',
      'NGÔN NGỮ: tin nhắn có thể là TIẾNG VIỆT, TIẾNG ANH, hoặc TRỘN CẢ HAI',
      '(ví dụ: "Hoà ơi fix cái bug login trước thứ 6 nhé"). Bạn phải xử lý được cả ba.',
      'Tên thẻ (title) PHẢI viết cùng ngôn ngữ chính của tin nhắn gốc:',
      'tin nhắn tiếng Anh → title tiếng Anh; tin nhắn tiếng Việt → title tiếng Việt.',
      '',
      'CÁCH XÁC ĐỊNH NGƯỜI PHỤ TRÁCH:',
      '- Gọi thẳng tên ("Ê Hoà", "Hoà ơi", "@Hoà", "Hey Hoa") → người đó phụ trách.',
      '- Đại từ ngôi thứ nhất ("tao", "tôi", "mình", "t", "I", "me") → NGƯỜI GỬI tin nhắn.',
      '  Ví dụ "để tao còn làm chức năng thanh toán" nghĩa là NGƯỜI GỬI phụ trách việc đó.',
      '- Không rõ ai → bỏ trống assigneeId, đừng đoán bừa.',
      '- assigneeId phải lấy ĐÚNG từ danh sách thành viên được cung cấp, không tự bịa.',
      '',
      'MỘT TIN NHẮN CÓ THỂ SINH RA NHIỀU THẺ.',
      'Ví dụ "mày làm giỏ hàng đi để tao còn làm thanh toán" = 2 thẻ, 2 người khác nhau.',
      '',
      'TIÊU ĐỀ THẺ: ngắn gọn như tên đầu việc (3–10 từ), KHÔNG chép nguyên câu chat,',
      'không giữ lời chào/đại từ. "Ê Hoà, mày giúp tao làm chức năng thêm giỏ hàng đi"',
      '→ title là "Chức năng thêm giỏ hàng".',
      '',
      'HẠN CHÓT: quy ra ngày cụ thể dạng YYYY-MM-DD dựa trên NGÀY HÔM NAY được cung cấp.',
      'Hiểu cả "hôm nay/mai/thứ 6/cuối tuần" lẫn "today/tomorrow/by Friday/next week/EOD".',
      'CHỈ đặt dueDate cho thẻ mà tin nhắn nêu rõ thời hạn cho CHÍNH việc đó.',
      'TUYỆT ĐỐI không suy mốc thời gian của việc này sang việc khác. Ví dụ',
      '"mày làm giỏ hàng trong hôm nay để tao còn làm thanh toán": chỉ thẻ giỏ hàng',
      'có hạn hôm nay, thẻ thanh toán KHÔNG có hạn (bỏ trống dueDate).',
      '',
      'KHÔNG PHẢI GIAO VIỆC (isTask=false, cards rỗng):',
      'chào hỏi, tán gẫu, hỏi thông tin, báo cáo việc ĐÃ xong, bình luận chung chung.',
      '',
      'confidence: 0.9+ khi câu giao việc rõ ràng có người nhận; 0.6–0.8 khi ngụ ý;',
      'dưới 0.5 khi mơ hồ.',
    ].join('\n');
  }

  private userPrompt(input: DetectTasksInput): string {
    const thanhVien = input.members
      .map((m) => `  - id="${m.id}" tên="${m.displayName}"`)
      .join('\n');
    const cot = input.lists
      .map((l) => `  - id="${l.id}" tên="${l.name}"`)
      .join('\n');
    const nganhCanh = input.recent.length
      ? input.recent.map((m) => `  ${m.displayName}: ${m.content}`).join('\n')
      : '  (không có)';

    return [
      `HÔM NAY: ${input.today} (giờ Việt Nam)`,
      '',
      'THÀNH VIÊN BOARD:',
      thanhVien || '  (không có)',
      '',
      'CÁC CỘT TRONG BOARD:',
      cot || '  (không có)',
      '',
      'VÀI TIN NHẮN TRƯỚC ĐÓ (cũ → mới):',
      nganhCanh,
      '',
      `NGƯỜI GỬI TIN NHẮN CẦN PHÂN TÍCH: id="${input.sender.id}" tên="${input.sender.displayName}"`,
      'TIN NHẮN CẦN PHÂN TÍCH:',
      input.content.slice(0, MAX_CONTENT),
    ].join('\n');
  }

  /**
   * KIỂM TRA LẠI KẾT QUẢ CỦA MODEL — bước bắt buộc, không được tin thẳng.
   *
   * Model bịa id là chuyện bình thường (nó thấy "Hoà" rồi tự chế ra một uid trông
   * hợp lý). Bỏ TRƯỜNG sai thay vì bỏ CẢ THẺ: một cái assigneeId hỏng không đáng
   * để mất luôn đầu việc mà nó trích đúng.
   */
  private validate(raw: unknown, input: DetectTasksInput): DetectTasksResult {
    const rong: DetectTasksResult = { isTask: false, confidence: 0, cards: [] };
    if (!raw || typeof raw !== 'object') return rong;

    const r = raw as {
      isTask?: unknown;
      confidence?: unknown;
      cards?: unknown;
    };
    const confidence = typeof r.confidence === 'number' ? r.confidence : 0;
    if (r.isTask !== true || confidence < NGUONG_TU_TIN) return rong;
    if (!Array.isArray(r.cards) || !r.cards.length) return rong;

    const idThanhVien = new Set(input.members.map((m) => m.id));
    const idCot = new Set(input.lists.map((l) => l.id));
    const cotMacDinh = input.lists[0]?.id;

    const cards: SuggestedCard[] = [];
    for (const item of r.cards as Record<string, unknown>[]) {
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      if (!title) continue; // thẻ không tên thì giữ lại cũng vô nghĩa

      const card: SuggestedCard = { title: title.slice(0, 200) };

      if (typeof item.description === 'string' && item.description.trim()) {
        card.description = item.description.trim().slice(0, 1000);
      }

      // Chỉ nhận uid CÓ THẬT trong board này.
      if (
        typeof item.assigneeId === 'string' &&
        idThanhVien.has(item.assigneeId)
      ) {
        card.assigneeId = item.assigneeId;
      }

      // Ngày phải đúng định dạng VÀ là ngày có thật (2026-02-31 lọt regex nhưng
      // xuống Postgres là vỡ).
      if (
        typeof item.dueDate === 'string' &&
        DINH_DANG_NGAY.test(item.dueDate)
      ) {
        const d = new Date(`${item.dueDate}T00:00:00Z`);
        if (
          !Number.isNaN(d.getTime()) &&
          d.toISOString().slice(0, 10) === item.dueDate
        ) {
          card.dueDate = item.dueDate;
        }
      }

      // Cột lạ thì rơi về cột đầu tiên — thà vào nhầm cột còn hơn mất thẻ.
      card.listId =
        typeof item.listId === 'string' && idCot.has(item.listId)
          ? item.listId
          : cotMacDinh;

      card.priority = MUC_UU_TIEN.includes(item.priority as never)
        ? (item.priority as SuggestedCard['priority'])
        : 'medium';

      cards.push(card);
      if (cards.length >= 5) break; // một tin nhắn đẻ ra hơn 5 thẻ thì gần như chắc là model loạn
    }

    if (!cards.length) return rong;
    return { isTask: true, confidence, cards };
  }
}
