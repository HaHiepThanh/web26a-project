import { TourStepId } from '../../models';

/**
 * Định nghĩa các bước của tour. Đặc tả: docs/HUONG-DAN-NGUOI-DUNG-MOI.md §3
 *
 * Tầng 1 (4 bước) — tour KHÔNG mô tả cách tạo workspace, nó bắt người dùng tạo
 * thật, và chỉ sang bước sau khi hành động THÀNH CÔNG.
 *
 * Tầng 2 (3 bước) — Filter, Chat + AI, Meet/Calendar. Hai bước đầu vô nghĩa
 * trên board một thẻ, nên trước tầng 2 phải gieo dữ liệu mẫu (xem tour.seed.ts).
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

/**
 * Điều kiện sang bước sau: một con số tăng lên, một cờ bật lên, hoặc chỉ cần
 * người dùng đọc xong rồi bấm Next.
 *
 * `ack` dành cho bước GIỚI THIỆU thuần tuý — thứ không đo được bằng gì cả.
 * Bước Meet/Calendar là vậy: hai cái nút đó bị khoá cho tới khi người dùng liên
 * kết Google, nên không có hành động nào để chờ và không có cờ nào để bật. Mượn
 * tạm một cờ của tính năng khác cho đủ kiểu dữ liệu thì bước này sẽ tự đánh dấu
 * "xong" mỗi khi người dùng vô tình mở đúng tính năng đó — sai lệch âm thầm.
 */
export type TourAdvance =
  | { on: 'count'; key: keyof TourCounts }
  | { on: 'flag'; key: keyof TourFlags }
  | { on: 'ack' };

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
   * Hình minh hoạ vẽ trong popover, thay cho việc bắt người dùng thao tác thật.
   *
   * Chỉ dùng cho bước giới thiệu thứ mà người dùng CHƯA bấm được: nút Meet và
   * nút Schedule đều khoá cho tới khi liên kết Google. Bảo họ "thử đi" là bảo
   * làm một việc bất khả thi, nên tour tự vẽ ra cho họ xem trước.
   *
   * Là mã định danh chứ không phải đường dẫn ảnh: hình vẽ thẳng bằng SVG trong
   * template nên tự đổi màu theo sáng/tối, không thêm file nào để tải, và không
   * bị mờ trên màn hình nét cao.
   */
  art?: 'meet-calendar';
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
    // MỘT bước cho cả khung chat lẫn trợ lý AI đọc chat.
    //
    // Trước đây là hai bước, và bước AI neo vào chip gợi ý trong khung chat.
    // Chip đó do backend sinh ra sau khi Gemini đọc tin nhắn, mà Gemini là TÙY
    // CHỌN: thiếu `GEMINI_API_KEY` thì backend tự tắt tính năng và chip không
    // bao giờ xuất hiện — bước hết giờ chờ neo rồi bị bỏ, nên trên mọi môi
    // trường chưa bật AI người dùng không nghe được một chữ nào về trợ lý.
    //
    // Neo giờ là cái NÚT MỞ CHAT, thứ luôn có mặt. Lời giới thiệu về trợ lý đi
    // kèm trong cùng popover, còn chip có hiện hay không chỉ còn là minh hoạ
    // chứ không quyết định bước này sống hay chết.
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
    body: 'The chat lives beside the board, not in another app. Drag its edge to resize, collapse it when you need room, and everyone sees messages as they arrive. The assistant reads along: when a message hides real work, it drafts cards for it — every field editable, every card unticked with one click. It proposes, you decide.',
  },
  {
    // Bước GIỚI THIỆU, không bắt làm thử — và đó là điều bắt buộc, không phải
    // lựa chọn cho gọn. Cả hai nút mang `[disabled]="!googleLinked()"`: người
    // dùng mới tinh chưa liên kết Google thì bấm không ăn. Một bước tour chờ
    // một cú bấm bất khả thi là một bước treo cứng.
    //
    // Nên nó dừng ở `on: 'ack'` — đọc, xem hình, bấm Finish.
    id: 'meet-calendar',
    anchor: 'meet-calendar',
    page: 'board',
    tier: 2,
    advance: { on: 'ack' },
    // Neo nằm giữa thanh tiêu đề board, sát mép trên. Popover đứng dưới nó là
    // đè lên hàng cột đầu tiên; ghim đáy màn hình để chừa nguyên board, giống
    // bước Filter ngay trên.
    placement: 'bottom',
    dim: false,
    art: 'meet-calendar',
    // Neo là cái BỌC quanh hai nút, và cái bọc đó rỗng với thành viên thường —
    // `canManageMeet()` false thì không nút nào được vẽ. Rỗng nghĩa là 0×0,
    // nghĩa là lớp phủ không tìm thấy neo và hết giờ. `optional` để lúc đó tour
    // vẫn kết thúc ở trạng thái "done" và vẫn kịp hỏi dọn thẻ mẫu.
    optional: true,
    title: 'Meet and schedule, without leaving the board',
    body: 'Start meeting opens a Google Meet room named after this board — one click, no pasting links into chat. Schedule plans one for later: it writes the Google Calendar event, and imports or exports .ics so people outside the app still get it. Both unlock once you link Google in Settings → Profile.',
  },
] as const;

export function stepIndexOf(id: TourStepId): number {
  return TOUR_STEPS.findIndex((s) => s.id === id);
}

/** Chỉ số của bước tầng 2 đầu tiên — nơi chế độ "Just the basics" dừng lại. */
export const FIRST_TIER_2_INDEX = TOUR_STEPS.findIndex((s) => s.tier === 2);
