import { TourStepId } from '../../models';

/**
 * Định nghĩa 4 bước của tầng 1. Đặc tả: docs/HUONG-DAN-NGUOI-DUNG-MOI.md §3.1
 *
 * Nguyên tắc: tour KHÔNG mô tả cách tạo workspace — nó bắt người dùng tạo thật.
 * Tooltip trỏ vào nút thật, người dùng bấm thật, và tour chỉ sang bước sau khi
 * hành động THÀNH CÔNG.
 */

/**
 * Bốn thứ được đếm để biết một bước đã xong chưa.
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

export const EMPTY_COUNTS: TourCounts = {
  workspaces: 0,
  boards: 0,
  lists: 0,
  cards: 0,
};

export interface TourStep {
  id: TourStepId;
  /** Giá trị của `data-tour` trên phần tử cần soi sáng. */
  anchor: string;
  /** Tiêu đề trên popover. Tiếng Anh — đây là chữ người dùng đọc. */
  title: string;
  body: string;
  /** Trang mà bước này diễn ra — dùng để biết có nên hiện popover hay không. */
  page: 'workspace' | 'board';
  /** Trường trong `TourCounts` phải tăng lên thì bước mới coi là xong. */
  countKey: keyof TourCounts;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'create-workspace',
    anchor: 'create-workspace',
    page: 'workspace',
    countKey: 'workspaces',
    title: 'Start with a workspace',
    body: 'A workspace holds the boards for one project or one class. Create your first one — the tour waits for you.',
  },
  {
    id: 'create-board',
    anchor: 'create-board',
    page: 'workspace',
    countKey: 'boards',
    title: 'Now add a board',
    body: 'A board is where the work lives: columns on the left to right, cards inside them. Create one and we will open it together.',
  },
  {
    id: 'add-list',
    anchor: 'add-list',
    page: 'board',
    countKey: 'lists',
    title: 'Add your first column',
    body: 'Columns are stages of work — To Do, In Progress, Done. Name the first one whatever fits your project.',
  },
  {
    id: 'add-card',
    anchor: 'add-card',
    page: 'board',
    countKey: 'cards',
    title: 'And your first card',
    body: 'A card is one piece of work. Drag it between columns to move it along — there is no Save button, dragging is saving.',
  },
] as const;

export function stepIndexOf(id: TourStepId): number {
  return TOUR_STEPS.findIndex((s) => s.id === id);
}
