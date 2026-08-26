/**
 * Hợp đồng dữ liệu cho tour hướng dẫn người dùng mới.
 *
 * Lưu ở cột `users.onboarding_state jsonb` (migration 0007). Đây là nguồn sự
 * thật DUY NHẤT cho câu hỏi "người này đã được hướng dẫn chưa" — không nhân bản
 * sang localStorage, vì hai nguồn thì kiểu gì cũng lệch.
 *
 * Đặc tả đầy đủ: docs/HUONG-DAN-NGUOI-DUNG-MOI.md
 */

/**
 * Bốn bước của tầng 1. Tour KHÔNG mô tả cách làm — nó bắt người dùng làm thật,
 * và chỉ sang bước sau khi dữ liệu thật đã về (nghe store, không nghe click).
 *
 * Thứ tự trong mảng chính là thứ tự chạy; đừng đảo mà không sửa `TOUR_STEPS`.
 */
export const TOUR_STEP_IDS = [
  // --- Tầng 1: làm thật, không xem phim ---
  'create-workspace',
  'create-board',
  'add-list',
  'add-card',
  // --- Tầng 2: có dữ liệu rồi mới dạy ---
  // Ba tính năng này VÔ NGHĨA trên board một thẻ: lọc 1/1 thẻ thì không ai hiểu
  // nó để làm gì. Nên tầng 2 gieo dữ liệu mẫu trước, rồi mới trỏ vào chúng.
  'use-filter',
  'open-chat',
  'try-ai',
] as const;

/** Bốn bước đầu là tầng 1 — chế độ "Just the basics" dừng ở đây. */
export const TIER_1_STEP_COUNT = 4;

export type TourStepId = (typeof TOUR_STEP_IDS)[number];

/**
 * `not-started` — chưa từng chạy, và chưa từ chối. Đủ điều kiện hiện hộp mời.
 * `running`     — đang dở. `currentStep` cho biết dở ở đâu để hỏi "Resume?".
 * `done`        — đã đi hết tầng 1.
 * `skipped`     — người dùng chọn "I'll explore myself".
 *
 * ⚠️ `skipped` KHÔNG phải là "không bao giờ hiện lại". Thanh checklist ở góc vẫn
 *    còn, và mục "Restart tutorial" trong Cài đặt vẫn chạy lại được. Chữ "Không"
 *    mà xoá sạch đường quay lại là lỗi thiết kế phổ biến nhất của onboarding.
 */
export type TourStatus = 'not-started' | 'running' | 'done' | 'skipped';

export interface OnboardingState {
  status: TourStatus;
  /** Bước đang dở khi `status === 'running'`; null ở mọi trạng thái khác. */
  currentStep: TourStepId | null;
  /** Các bước đã xong. Dùng để vẽ thanh "Getting started — 2/4". */
  completed: TourStepId[];
  /**
   * Coach mark đã XONG — không bao giờ hiện lại nữa.
   *
   * Vào đây theo hai đường: người dùng bấm × (đọc thật rồi), hoặc đã lướt qua
   * đủ 3 lần mà vẫn không đọc.
   */
  seenCoachMarks: string[];
  /**
   * Số lần đã LƯỚT QUA từng mẩu — bấm ra ngoài chứ không bấm ×.
   *
   * ⚠️ Không có cái này thì một cú bấm vô tình xoá sạch mẩu chỉ dẫn vĩnh viễn.
   *    Coach mark cố ý KHÔNG chặn chuột, nên người đang với tay bấm một cái thẻ
   *    sẽ vô tình "đóng" bong bóng vừa hiện ra 0,4 giây trước — chưa đọc chữ
   *    nào. Đếm riêng để lần sau còn hiện lại, tối đa 3 lần rồi mới thôi.
   */
  coachViews: Record<string, number>;
  /**
   * Số phiên đã chào. Dùng cho luật giảm dần tiếng nói của linh vật
   * (docs/LINH-VAT-CHAO-NGUOI-DUNG.md §3) — để chung ở đây thay vì đẻ cột mới.
   */
  greetCount: number;
  /**
   * Id của các cột và thẻ do tầng 2 gieo vào, để cuối tour còn dọn đúng những
   * thứ mình tạo ra.
   *
   * Phải lưu id chứ không phải một cờ "đã gieo": dọn theo kiểu "xoá hết thẻ
   * trong board" sẽ cuốn theo cả cái thẻ người dùng tự tay tạo ở bước 4, và cả
   * thẻ của đồng đội nếu board có nhiều người.
   */
  seeded: { listIds: string[]; cardIds: string[] } | null;
  /** ISO string. Chỉ để soi lỗi, không có logic nào đọc nó. */
  updatedAt: string;
}

/**
 * Trạng thái của một người chưa từng chạy tour.
 *
 * Dùng khi backend trả `onboardingState` là `null` — tức tài khoản tạo trước
 * migration 0007, hoặc vừa đăng ký xong. Hàm chứ không phải hằng: trả về hằng
 * dùng chung thì mọi nơi share một tham chiếu, sửa nhầm một chỗ là hỏng cả app.
 */
export function emptyOnboardingState(): OnboardingState {
  return {
    status: 'not-started',
    currentStep: null,
    completed: [],
    seenCoachMarks: [],
    coachViews: {},
    greetCount: 0,
    seeded: null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Chuẩn hoá dữ liệu đọc từ backend về đúng hình dạng `OnboardingState`.
 *
 * Cột là `jsonb` nên database KHÔNG kiểm hình dạng giúp — bản ghi cũ có thể
 * thiếu field mới thêm, hoặc chứa rác nếu ai đó sửa tay trong Supabase. Không
 * lọc ở đây thì `state.completed.length` sẽ nổ `undefined is not an object`
 * ngay lần render đầu.
 */
export function parseOnboardingState(raw: unknown): OnboardingState {
  const base = emptyOnboardingState();
  if (raw === null || typeof raw !== 'object') return base;

  const o = raw as Partial<Record<keyof OnboardingState, unknown>>;
  const validIds = new Set<string>(TOUR_STEP_IDS);
  const statuses: TourStatus[] = ['not-started', 'running', 'done', 'skipped'];

  const status = statuses.includes(o.status as TourStatus)
    ? (o.status as TourStatus)
    : base.status;

  const currentStep =
    typeof o.currentStep === 'string' && validIds.has(o.currentStep)
      ? (o.currentStep as TourStepId)
      : null;

  const completed = Array.isArray(o.completed)
    ? (o.completed.filter(
        (s): s is TourStepId => typeof s === 'string' && validIds.has(s),
      ) as TourStepId[])
    : base.completed;

  const rawViews = o.coachViews;
  const coachViews: Record<string, number> = {};
  if (rawViews && typeof rawViews === 'object') {
    for (const [k, v] of Object.entries(rawViews as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) coachViews[k] = Math.floor(v);
    }
  }

  const seenCoachMarks = Array.isArray(o.seenCoachMarks)
    ? o.seenCoachMarks.filter((s): s is string => typeof s === 'string')
    : base.seenCoachMarks;

  const greetCount =
    typeof o.greetCount === 'number' && Number.isFinite(o.greetCount) && o.greetCount >= 0
      ? Math.floor(o.greetCount)
      : base.greetCount;

  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
  const rawSeeded = o.seeded as { listIds?: unknown; cardIds?: unknown } | null | undefined;
  const seeded =
    rawSeeded && typeof rawSeeded === 'object'
      ? { listIds: strArr(rawSeeded.listIds), cardIds: strArr(rawSeeded.cardIds) }
      : null;

  return {
    status,
    // `running` mà không biết dở ở đâu là trạng thái không đi tiếp được: quay về
    // bước đầu tiên còn hơn để tour treo ở màn hình mờ không có popover nào.
    currentStep: status === 'running' ? (currentStep ?? TOUR_STEP_IDS[0]) : null,
    completed,
    seenCoachMarks,
    coachViews,
    greetCount,
    seeded,
    updatedAt:
      typeof o.updatedAt === 'string' ? o.updatedAt : base.updatedAt,
  };
}
