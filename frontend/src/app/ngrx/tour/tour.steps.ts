import { TourStepId } from '../../models';

/**
 * Định nghĩa các bước của tour. Đặc tả: docs/HUONG-DAN-NGUOI-DUNG-MOI.md §3
 *
 * Tầng 1 (4 bước) — tour KHÔNG mô tả cách tạo workspace, nó bắt người dùng tạo
 * thật, và chỉ sang bước sau khi hành động THÀNH CÔNG.
 *
 * Tầng 2 (3 bước) — Filter, Chat, AI. Ba thứ này vô nghĩa trên board một thẻ,
 * nên trước tầng 2 phải gieo dữ liệu mẫu (xem tour.seed.ts).
 */

/**
 * Bốn thứ được ĐẾM để biết một bước tầng 1 đã xong chưa.
 *
 * ⚠️ Đếm DỮ LIỆU, không nghe sự kiện click. Nghe click thì bấm nút rồi API trả
 *    lỗi, tour vẫn hớn hở đi tiếp và trỏ vào một cái board không tồn tại.
 */
export interface TourCounts {
  workspaces: number;
  boards: number;
  lists: number;
  cards: number;
}

/**
 * Ba trạng thái BẬT/TẮT cho tầng 2.
 *
 * Tầng 2 không tạo ra dữ liệu mới nên không đếm được — "đã hiểu bộ lọc chưa"
 * không phải một con số. Thứ đo được là người dùng đã thật sự MỞ cái đó ra chưa.
 */
export interface TourFlags {
  filterOpen: boolean;
  chatOpen: boolean;
  aiOpen: boolean;
}

export const EMPTY_COUNTS: TourCounts = {
  workspaces: 0,
  boards: 0,
  lists: 0,
  cards: 0,
};

export const EMPTY_FLAGS: TourFlags = {
  filterOpen: false,
  chatOpen: false,
  aiOpen: false,
};

/** Điều kiện sang bước sau: hoặc một con số tăng lên, hoặc một cờ bật lên. */
export type TourAdvance =
  | { on: 'count'; key: keyof TourCounts }
  | { on: 'flag'; key: keyof TourFlags };

export interface TourStep {
  id: TourStepId;
  /** Giá trị của `data-tour` trên phần tử cần soi sáng. */
  anchor: string;
  /** Tiêu đề trên popover. Tiếng Anh — đây là chữ người dùng đọc. */
  title: string;
  body: string;
  /** Trang mà bước này diễn ra — dùng để biết khi nào được phép bấm giờ bỏ bước. */
  page: 'workspace' | 'board';
  tier: 1 | 2;
  advance: TourAdvance;
  /**
   * Neo của bước này có thể KHÔNG BAO GIỜ xuất hiện, và đó không phải lỗi.
   *
   * Bỏ qua một bước tuỳ chọn không làm tour thất bại — nó vẫn kết thúc ở trạng
   * thái "done" như thường.
   */
  optional?: boolean;
  /** Thời gian chờ neo trước khi bỏ qua. Mặc định 3 giây. */
  waitMs?: number;
  /**
   * Popover đứng ở đâu so với neo. Mặc định `below`.
   *
   * `bottom` ghim popover xuống đáy màn hình, dành cho nút mà bấm vào là bung
   * ra một bảng lớn — đứng cạnh nút kiểu gì cũng che mất chính cái bảng đó.
   */
  placement?: 'below' | 'bottom';
  /**
   * Có làm mờ phần còn lại của màn hình không. Mặc định CÓ.
   *
   * Tắt cho các bước tầng 2. Tầng 1 chỉ vào đúng một nút và cần người dùng
   * không đi lạc — làm mờ là đúng. Tầng 2 bảo họ MỞ RA MÀ XEM: bảng lọc, khung
   * chat, bảng gợi ý AI đều bung ra bên ngoài vùng sáng quanh cái nút, nên lớp
   * mờ phủ luôn lên chính thứ vừa bảo họ mở. Vừa bấm Filter là bảng hiện ra
   * trong bóng tối — đúng cái mâu thuẫn đã phải sửa một lần với modal.
   */
  dim?: boolean;
  /**
   * Neo của bước này nằm BÊN TRONG khung chat.
   *
   * Dưới 768px khung chat mở ra là lớp phủ toàn màn hình, và lớp phủ đó bình
   * thường làm tour tự ẩn đi — nó che kín board nên soi sáng thứ nằm sau nó là
   * vô nghĩa. Nhưng neo của bước này lại nằm TRONG chính khung đó, nên luật kia
   * quay ra khoá chết bước: mở chat để thấy neo thì tour biến mất, đóng chat để
   * thấy tour thì neo biến mất theo.
   *
   * Phải khai báo tay chứ không dò bằng `contains()` được: lúc bước bắt đầu, chip
   * gợi ý CHƯA tồn tại — nó chỉ hiện sau khi Gemini trả lời — nên không có phần
   * tử nào để mà hỏi nó nằm ở đâu.
   */
  anchorInChat?: boolean;
}

export const TOUR_STEPS: readonly TourStep[] = [
  // ------------------------------------------------------------- Tầng 1
  {
    id: 'create-workspace',
    anchor: 'create-workspace',
    page: 'workspace',
    tier: 1,
    advance: { on: 'count', key: 'workspaces' },
    title: 'Start with a workspace',
    body: 'A workspace holds the boards for one project or one class. Create your first one — the tour waits for you.',
  },
  {
    id: 'create-board',
    anchor: 'create-board',
    page: 'workspace',
    tier: 1,
    advance: { on: 'count', key: 'boards' },
    title: 'Now add a board',
    body: 'A board is where the work lives: columns on the left to right, cards inside them. Create one and we will open it together.',
  },
  {
    id: 'add-list',
    anchor: 'add-list',
    page: 'board',
    tier: 1,
    advance: { on: 'count', key: 'lists' },
    title: 'Add your first column',
    body: 'Columns are stages of work — To Do, In Progress, Done. Name the first one whatever fits your project.',
  },
  {
    id: 'add-card',
    anchor: 'add-card',
    page: 'board',
    tier: 1,
    advance: { on: 'count', key: 'cards' },
    title: 'And your first card',
    // Nói rõ phải ĐẶT TÊN rồi lưu. Modal chi tiết thẻ xoá luôn thẻ vừa tạo nếu
    // đóng đi mà chưa sửa gì (`isAbandonedFreshCard`), nên bảo họ "tạo thẻ" rồi
    // để họ đóng ngang là họ mất đúng cái vừa làm mà không hiểu vì sao.
    body: 'A card is one piece of work. Name it and save — a card closed without a name is thrown away. After that, dragging it between columns is all the saving it needs.',
  },

  // ------------------------------------------------------------- Tầng 2
  {
    id: 'use-filter',
    anchor: 'filter',
    page: 'board',
    tier: 2,
    advance: { on: 'flag', key: 'filterOpen' },
    // Bảng lọc bung ra dưới nút, rộng 320px và CĂN PHẢI nên nó thò sang trái xa
    // hơn cả cái nút — đứng dưới hay đứng cạnh nút đều che mất nó. Ra hẳn đáy.
    placement: 'bottom',
    dim: false,
    title: 'Find work in a busy board',
    body: 'Open Filter and pick High priority. Watch the badge — it counts how many of the cards survived the filter, so you can see it working.',
  },
  {
    id: 'open-chat',
    anchor: 'chat',
    page: 'board',
    tier: 2,
    advance: { on: 'flag', key: 'chatOpen' },
    // Khung chat là một cột cao chạy hết chiều dọc bên trái; popover đứng cạnh
    // nó là che mất phần lớn nội dung chat.
    placement: 'bottom',
    dim: false,
    title: 'Talk next to the work',
    body: 'The chat lives beside the board, not in another app. Drag its edge to resize, collapse it when you need room. Everyone sees messages as they arrive.',
  },
  {
    id: 'try-ai',
    anchor: 'ai-suggestion',
    page: 'board',
    tier: 2,
    advance: { on: 'flag', key: 'aiOpen' },
    // Bước DUY NHẤT phụ thuộc vào một thứ tour không điều khiển được.
    //
    // Chip gợi ý do backend sinh ra sau khi Gemini đọc tin nhắn, và Gemini là
    // TÙY CHỌN: thiếu `GEMINI_API_KEY` thì backend tự tắt tính năng và ghi log
    // "tính năng gợi ý tạo thẻ TẮT" — chip sẽ không bao giờ xuất hiện. Kể cả khi
    // có key, một lượt gọi API mất vài giây.
    //
    // Nên bước này chờ lâu hơn hẳn, và bỏ qua được mà không kéo cả tour xuống.
    // Không có hai thứ đó thì trên mọi môi trường chưa cấu hình AI, người dùng
    // làm xong sáu bước vẫn nhận về một tour "thất bại" — và 8 thẻ mẫu nằm lại
    // board vì tour chết trước khi kịp hỏi dọn.
    // Chip gợi ý nằm trong khung chat bên trái; popover đứng cạnh nó là đè lên
    // chính đoạn hội thoại mà assistant vừa đọc để nghĩ ra gợi ý.
    placement: 'bottom',
    dim: false,
    anchorInChat: true,
    optional: true,
    waitMs: 12000,
    title: 'The assistant reads the chat',
    body: 'It spotted work in a message and drafted cards for it. Open the suggestion: every field is editable and every card can be unticked. It proposes — you decide.',
  },
] as const;

export function stepIndexOf(id: TourStepId): number {
  return TOUR_STEPS.findIndex((s) => s.id === id);
}

/** Chỉ số của bước tầng 2 đầu tiên — nơi chế độ "Just the basics" dừng lại. */
export const FIRST_TIER_2_INDEX = TOUR_STEPS.findIndex((s) => s.tier === 2);
