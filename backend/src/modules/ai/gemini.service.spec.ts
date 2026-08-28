import { ConfigService } from '@nestjs/config';
import { GeminiService } from './gemini.service';
import { batTen, ThanhVienTen } from './nhan-dien-ten.util';

const BOARD: ThanhVienTen[] = [
  { id: 'u-hiep', displayName: 'Hà Hiệp Thanh' },
  { id: 'u-phuong', displayName: 'Lê Phương Thanh' },
  { id: 'u-hoa', displayName: 'Ngô Đức Hoà' },
];

const dung = () =>
  new GeminiService({
    get: (k: string) => (k === 'GEMINI_API_KEY' ? 'khoa-gia' : undefined),
  } as unknown as ConfigService);

/** Cổng lọc rẻ có cho tin nhắn này đi tiếp tới model không? */
const quaCong = (noiDung: string) =>
  dung().shouldAnalyze(noiDung, batTen(noiDung, BOARD));

describe('shouldAnalyze — cổng lọc rẻ', () => {
  it('BẮT ĐƯỢC tên viết tắt, không cần @', () => {
    // Chính là yêu cầu gốc. Bản trước trượt cả ba dấu hiệu: không có '@',
    // "h.thanh" không phải chuỗi con của "hà hiệp thanh", và câu không có mốc
    // thời gian nào — nên Gemini không bao giờ được gọi.
    expect(quaCong('ê H.Thanh, hãy lên kế hoạch chức năng thanh toán')).toBe(
      true,
    );
    expect(quaCong('P.Thanh lo phần giỏ hàng nhé')).toBe(true);
  });

  it('vẫn bắt tên đầy đủ và @ như cũ', () => {
    expect(quaCong('@Thanh làm giúp phần login đi')).toBe(true);
    expect(quaCong('nhờ Hà Hiệp Thanh làm phần này')).toBe(true);
    expect(quaCong('Hoà ơi lên tiếp kế hoạch phân quyền nha')).toBe(true);
  });

  it('KHÔNG tốn lượt gọi cho câu chỉ tình cờ chứa "thanh"', () => {
    // "thanh toán" bỏ dấu ra đúng chữ "thanh". Nếu cổng lọc nhận nhầm thì mọi
    // câu bàn về thanh toán đều gọi model — dự án này thì đó là rất nhiều câu.
    expect(quaCong('chức năng thanh toán làm tới đâu rồi')).toBe(false);
    expect(quaCong('phần hoàn thành thì để đó đã')).toBe(false);
  });

  it('không nhắc ai thì phải có CẢ động từ lẫn mốc thời gian', () => {
    expect(quaCong('sửa cái bug login trước thứ 6 nhé')).toBe(true);
    expect(quaCong('hôm nay trời đẹp quá đi mất')).toBe(false); // có mốc, thiếu động từ
    expect(quaCong('cần thêm cà phê gấp quá đi mất')).toBe(false); // có động từ, thiếu mốc
  });

  it('tin quá ngắn thì bỏ qua', () => {
    expect(quaCong('ok nhé')).toBe(false);
  });

  it('thiếu khoá thì tắt hẳn', () => {
    const g = new GeminiService({
      get: () => undefined,
    } as unknown as ConfigService);
    expect(g.shouldAnalyze('ê H.Thanh làm giúp phần này nhé', [])).toBe(false);
  });
});

describe('detectTasks — prompt gửi cho model', () => {
  afterEach(() => jest.restoreAllMocks());

  /** Bắt lấy phần thân request để soi prompt. */
  function batPrompt() {
    const f = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    isTask: false,
                    confidence: 0,
                    cards: [],
                  }),
                },
              ],
            },
          },
        ],
      }),
    });
    (global as unknown as { fetch: unknown }).fetch = f;
    return () => JSON.parse((f.mock.calls[0][1] as { body: string }).body);
  }

  const goi = async (noiDung: string) => {
    const doc = batPrompt();
    await dung().detectTasks({
      content: noiDung,
      sender: { id: 'u-hoa', displayName: 'Ngô Đức Hoà' },
      recent: [],
      members: BOARD,
      nhacTen: batTen(noiDung, BOARD),
      lists: [{ id: 'l1', name: 'To Do' }],
      today: '2026-08-28',
    });
    return doc().contents[0].parts[0].text as string;
  };

  it('nói THẲNG cho model biết H.Thanh là uid nào', async () => {
    // Model tự suy được, nhưng không ổn định — cùng câu, lúc ra Hiệp lúc ra
    // Phương. Đối chiếu sẵn thì nó chỉ còn việc trích đầu việc.
    const prompt = await goi(
      'ê H.Thanh, hãy lên kế hoạch chức năng thanh toán',
    );
    expect(prompt).toContain('"h.thanh" → id="u-hiep" (Hà Hiệp Thanh)');
  });

  it('phân biệt P.Thanh với H.Thanh', async () => {
    const prompt = await goi('P.Thanh lo phần giỏ hàng nhé');
    // Chỉ soi KHỐI ĐỐI CHIẾU: mọi uid đều xuất hiện ở mục THÀNH VIÊN BOARD phía
    // trên, nên tìm trên cả prompt thì khẳng định nào cũng đúng.
    const khoi = prompt.split('NGƯỜI ĐƯỢC GỌI TÊN')[1].split('VÀI TIN NHẮN')[0];
    expect(khoi).toContain('id="u-phuong"');
    expect(khoi).not.toContain('id="u-hiep"');
  });

  it('trùng tên riêng thì báo MƠ HỒ kèm đủ lựa chọn', async () => {
    const prompt = await goi('Thanh ơi làm giúp phần login nhé');
    expect(prompt).toContain('MƠ HỒ');
    expect(prompt).toContain('id="u-hiep"');
    expect(prompt).toContain('id="u-phuong"');
  });

  it('không ai được gọi tên thì ghi rõ, không bỏ trống mục', async () => {
    const prompt = await goi('sửa cái bug login trước thứ 6 nhé');
    expect(prompt).toContain('(không ai được gọi tên)');
  });
});
