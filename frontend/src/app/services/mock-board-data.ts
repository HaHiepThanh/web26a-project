import { BoardVisibility, CardPriority } from '../models';

/**
 * Nguồn dữ liệu board GIẢ LẬP duy nhất cho toàn frontend (chưa có backend thật).
 * board.service / list.service / card.service cùng đọc từ đây nên mỗi board có tên,
 * danh sách và thẻ RIÊNG — mở board nào ra đúng dữ liệu board đó. id b-1..b-4 khớp
 * với workspace.ts (grid board) và chat.service (MESSAGE_SETS) để mọi màn thống nhất.
 */

/** Card mẫu — `listIndex` trỏ vào `lists[]` theo thứ tự (list id thật sinh lúc load). */
export interface MockCardSeed {
  listIndex: number;
  title: string;
  priority: CardPriority;
  assigneeId?: string;
  dueDate?: string; // 'YYYY-MM-DD'
}

export interface MockBoardSeed {
  id: string;
  name: string;
  workspaceId: string;
  visibility: BoardVisibility;
  lists: { name: string; color: string }[];
  cards: MockCardSeed[];
}

export const MOCK_BOARDS: Record<string, MockBoardSeed> = {
  'b-1': {
    id: 'b-1',
    name: 'Hệ thống Quản lý Kanban',
    workspaceId: 'ws-1',
    visibility: 'public',
    lists: [
      { name: 'Cần làm', color: '#64748b' },
      { name: 'Đang làm', color: '#2563eb' },
      { name: 'Review', color: '#d97706' },
      { name: 'Hoàn thành', color: '#059669' },
    ],
    cards: [
      { listIndex: 0, title: 'Thiết kế wireframe trang chủ', priority: 'high', assigneeId: 'u-linh', dueDate: '2026-08-05' },
      { listIndex: 0, title: 'Viết API xác thực người dùng', priority: 'medium', assigneeId: 'u-khoa', dueDate: '2026-08-10' },
      { listIndex: 0, title: 'Chuẩn hoá style guide UI', priority: 'low', assigneeId: 'u-my' },
      { listIndex: 1, title: 'Review pull request #482', priority: 'medium', assigneeId: 'u-nam', dueDate: '2026-08-04' },
      { listIndex: 1, title: 'Tối ưu tốc độ tải trang', priority: 'high', assigneeId: 'u-bao', dueDate: '2026-08-03' },
      { listIndex: 2, title: 'Kiểm thử luồng thanh toán', priority: 'high', assigneeId: 'u-khoa', dueDate: '2026-08-06' },
      { listIndex: 3, title: 'Chuẩn bị demo cho khách hàng', priority: 'medium', assigneeId: 'u-linh', dueDate: '2026-08-01' },
    ],
  },
  'b-2': {
    id: 'b-2',
    name: 'Ứng dụng tìm trọ thông minh',
    workspaceId: 'ws-1',
    visibility: 'restricted',
    lists: [
      { name: 'Ý tưởng', color: '#7c3aed' },
      { name: 'Đang phát triển', color: '#2563eb' },
      { name: 'Kiểm thử', color: '#d97706' },
      { name: 'Đã phát hành', color: '#059669' },
    ],
    cards: [
      { listIndex: 0, title: 'Khảo sát nhu cầu sinh viên thuê trọ', priority: 'medium', assigneeId: 'u-my', dueDate: '2026-08-12' },
      { listIndex: 0, title: 'Thiết kế bản đồ lọc theo khu vực', priority: 'high', assigneeId: 'u-linh', dueDate: '2026-08-15' },
      { listIndex: 1, title: 'Tích hợp đăng nhập Google', priority: 'high', assigneeId: 'u-nam', dueDate: '2026-08-09' },
      { listIndex: 1, title: 'Màn hình danh sách phòng trọ', priority: 'medium', assigneeId: 'u-khoa', dueDate: '2026-08-14' },
      { listIndex: 2, title: 'Kiểm thử tìm kiếm theo giá', priority: 'low', assigneeId: 'u-bao' },
      { listIndex: 3, title: 'Phát hành bản beta cho 20 người dùng', priority: 'medium', assigneeId: 'u-my', dueDate: '2026-08-02' },
    ],
  },
  'b-3': {
    id: 'b-3',
    name: 'Kế hoạch Tuần cá nhân',
    workspaceId: 'ws-1',
    visibility: 'restricted',
    lists: [
      { name: 'Việc cần làm', color: '#64748b' },
      { name: 'Đang làm', color: '#2563eb' },
      { name: 'Xong', color: '#059669' },
    ],
    cards: [
      { listIndex: 0, title: 'Đọc 30 trang sách chuyên ngành', priority: 'low', assigneeId: 'u-nam', dueDate: '2026-08-11' },
      { listIndex: 0, title: 'Chuẩn bị slide báo cáo tuần', priority: 'high', assigneeId: 'u-nam', dueDate: '2026-08-08' },
      { listIndex: 0, title: 'Đi chợ & nấu ăn cuối tuần', priority: 'low', assigneeId: 'u-nam' },
      { listIndex: 1, title: 'Hoàn thành bài tập lớn môn AI', priority: 'high', assigneeId: 'u-nam', dueDate: '2026-08-07' },
      { listIndex: 2, title: 'Tập gym 3 buổi', priority: 'medium', assigneeId: 'u-nam', dueDate: '2026-08-03' },
    ],
  },
  'b-4': {
    id: 'b-4',
    name: 'Sản phẩm MVP v1.0',
    workspaceId: 'ws-2',
    visibility: 'public',
    lists: [
      { name: 'Backlog', color: '#64748b' },
      { name: 'Sprint hiện tại', color: '#2563eb' },
      { name: 'Đang review', color: '#d97706' },
      { name: 'Hoàn thành', color: '#059669' },
    ],
    cards: [
      { listIndex: 0, title: 'Xác định tính năng cốt lõi MVP', priority: 'high', assigneeId: 'u-khoa', dueDate: '2026-08-13' },
      { listIndex: 0, title: 'Vẽ user flow onboarding', priority: 'medium', assigneeId: 'u-linh', dueDate: '2026-08-16' },
      { listIndex: 1, title: 'Dựng landing page', priority: 'high', assigneeId: 'u-my', dueDate: '2026-08-09' },
      { listIndex: 1, title: 'Thiết lập thanh toán Stripe', priority: 'high', assigneeId: 'u-nam', dueDate: '2026-08-10' },
      { listIndex: 2, title: 'Review bảo mật API', priority: 'medium', assigneeId: 'u-bao', dueDate: '2026-08-06' },
      { listIndex: 3, title: 'Chuẩn bị pitch cho nhà đầu tư', priority: 'high', assigneeId: 'u-khoa', dueDate: '2026-08-01' },
    ],
  },
};

export const DEFAULT_BOARD_ID = 'b-1';

/** Seed của 1 board theo id — board lạ (id tự tạo) rơi về b-1 nhưng giữ đúng id truyền vào. */
export function boardSeed(boardId: string): MockBoardSeed {
  const seed = MOCK_BOARDS[boardId];
  return seed ?? { ...MOCK_BOARDS[DEFAULT_BOARD_ID], id: boardId };
}

export const ALL_MOCK_BOARD_IDS = Object.keys(MOCK_BOARDS);
