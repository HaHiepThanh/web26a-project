import { BoardBackground, BoardVisibility, CardPriority } from '../models';

/**
 * Nguồn dữ liệu board GIẢ LẬP duy nhất cho toàn frontend (chưa có backend thật).
 * board.service / list.service / card.service cùng đọc từ đây nên mỗi board có tên,
 * danh sách và thẻ RIÊNG — mở board nào ra đúng dữ liệu board đó.
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
  /** Màu nền trang Board — board demo cũng có màu để nền + danh sách luôn nổi bật */
  background: BoardBackground;
  lists: { name: string; color: string }[];
  cards: MockCardSeed[];
}

export const MOCK_BOARDS: Record<string, MockBoardSeed> = {
  // -- Dữ liệu mẫu đã comment để test từ tài khoản trắng hoàn toàn — bỏ comment để khôi phục --
  // 'b-1': {
  //   id: 'b-1',
  //   name: 'Hệ thống Quản lý Kanban',
  //   workspaceId: 'ws-1',
  //   visibility: 'public',
  //   background: 'bg-board-purple',
  //   lists: [
  //     { name: 'Cần làm', color: '#64748b' },
  //     { name: 'Đang làm', color: '#2563eb' },
  //     { name: 'Review', color: '#d97706' },
  //     { name: 'Hoàn thành', color: '#059669' },
  //   ],
  //   cards: [
  //     { listIndex: 0, title: 'Thiết kế wireframe trang chủ', priority: 'high', assigneeId: '8f4c2e10-9b3a-4e2a-871d-5b3a1a2e3f40', dueDate: '2026-08-05' },
  //     { listIndex: 0, title: 'Viết API xác thực người dùng', priority: 'medium', assigneeId: 'e2b5c710-4d8a-493e-91c2-6a8b0e5d4f12', dueDate: '2026-08-10' },
  //     { listIndex: 0, title: 'Chuẩn hoá style guide UI', priority: 'low', assigneeId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' },
  //     { listIndex: 1, title: 'Review pull request #482', priority: 'medium', assigneeId: '8f4c2e10-9b3a-4e2a-871d-5b3a1a2e3f40', dueDate: '2026-08-04' },
  //     { listIndex: 1, title: 'Tối ưu tốc độ tải trang', priority: 'high', assigneeId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', dueDate: '2026-08-03' },
  //     { listIndex: 2, title: 'Kiểm thử luồng thanh toán', priority: 'high', assigneeId: 'e2b5c710-4d8a-493e-91c2-6a8b0e5d4f12', dueDate: '2026-08-06' },
  //     { listIndex: 3, title: 'Chuẩn bị demo cho khách hàng', priority: 'medium', assigneeId: '3c7d1e45-8a2f-4c9b-b01e-7f6d5c4b3a21', dueDate: '2026-08-01' },
  //   ],
  // },
  // 'b-2': {
  //   id: 'b-2',
  //   name: 'Ứng dụng tìm trọ thông minh',
  //   workspaceId: 'ws-1',
  //   visibility: 'restricted',
  //   background: 'bg-board-teal',
  //   lists: [
  //     { name: 'Ý tưởng', color: '#7c3aed' },
  //     { name: 'Đang phát triển', color: '#2563eb' },
  //     { name: 'Kiểm thử', color: '#d97706' },
  //     { name: 'Đã phát hành', color: '#059669' },
  //   ],
  //   cards: [
  //     { listIndex: 0, title: 'Khảo sát nhu cầu sinh viên thuê trọ', priority: 'medium', assigneeId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', dueDate: '2026-08-12' },
  //     { listIndex: 0, title: 'Thiết kế bản đồ lọc theo khu vực', priority: 'high', assigneeId: '3c7d1e45-8a2f-4c9b-b01e-7f6d5c4b3a21', dueDate: '2026-08-15' },
  //     { listIndex: 1, title: 'Tích hợp đăng nhập Google', priority: 'high', assigneeId: '8f4c2e10-9b3a-4e2a-871d-5b3a1a2e3f40', dueDate: '2026-08-09' },
  //     { listIndex: 1, title: 'Màn hình danh sách phòng trọ', priority: 'medium', assigneeId: 'e2b5c710-4d8a-493e-91c2-6a8b0e5d4f12', dueDate: '2026-08-14' },
  //     { listIndex: 2, title: 'Kiểm thử tìm kiếm theo giá', priority: 'low', assigneeId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' },
  //     { listIndex: 3, title: 'Phát hành bản beta cho 20 người dùng', priority: 'medium', assigneeId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', dueDate: '2026-08-02' },
  //   ],
  // },
  // 'b-3': {
  //   id: 'b-3',
  //   name: 'Kế hoạch Tuần cá nhân',
  //   workspaceId: 'ws-1',
  //   visibility: 'restricted',
  //   background: 'bg-board-blue',
  //   lists: [
  //     { name: 'Việc cần làm', color: '#64748b' },
  //     { name: 'Đang làm', color: '#2563eb' },
  //     { name: 'Xong', color: '#059669' },
  //   ],
  //   cards: [
  //     { listIndex: 0, title: 'Đọc 30 trang sách chuyên ngành', priority: 'low', assigneeId: '8f4c2e10-9b3a-4e2a-871d-5b3a1a2e3f40', dueDate: '2026-08-11' },
  //     { listIndex: 0, title: 'Chuẩn bị slide báo cáo tuần', priority: 'high', assigneeId: '8f4c2e10-9b3a-4e2a-871d-5b3a1a2e3f40', dueDate: '2026-08-08' },
  //     { listIndex: 0, title: 'Đi chợ & nấu ăn cuối tuần', priority: 'low', assigneeId: '8f4c2e10-9b3a-4e2a-871d-5b3a1a2e3f40' },
  //     { listIndex: 1, title: 'Hoàn thành bài tập lớn môn AI', priority: 'high', assigneeId: '8f4c2e10-9b3a-4e2a-871d-5b3a1a2e3f40', dueDate: '2026-08-07' },
  //     { listIndex: 2, title: 'Tập gym 3 buổi', priority: 'medium', assigneeId: '8f4c2e10-9b3a-4e2a-871d-5b3a1a2e3f40', dueDate: '2026-08-03' },
  //   ],
  // },
  // 'b-4': {
  //   id: 'b-4',
  //   name: 'Sản phẩm MVP v1.0',
  //   workspaceId: 'ws-2',
  //   visibility: 'public',
  //   background: 'bg-board-orange',
  //   lists: [
  //     { name: 'Backlog', color: '#64748b' },
  //     { name: 'Sprint hiện tại', color: '#2563eb' },
  //     { name: 'Đang review', color: '#d97706' },
  //     { name: 'Hoàn thành', color: '#059669' },
  //   ],
  //   cards: [
  //     { listIndex: 0, title: 'Xác định tính năng cốt lõi MVP', priority: 'high', assigneeId: 'e2b5c710-4d8a-493e-91c2-6a8b0e5d4f12', dueDate: '2026-08-13' },
  //     { listIndex: 0, title: 'Vẽ user flow onboarding', priority: 'medium', assigneeId: '3c7d1e45-8a2f-4c9b-b01e-7f6d5c4b3a21', dueDate: '2026-08-16' },
  //     { listIndex: 1, title: 'Dựng landing page', priority: 'high', assigneeId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', dueDate: '2026-08-09' },
  //     { listIndex: 1, title: 'Thiết lập thanh toán Stripe', priority: 'high', assigneeId: '8f4c2e10-9b3a-4e2a-871d-5b3a1a2e3f40', dueDate: '2026-08-10' },
  //     { listIndex: 2, title: 'Review bảo mật API', priority: 'medium', assigneeId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', dueDate: '2026-08-06' },
  //     { listIndex: 3, title: 'Chuẩn bị pitch cho nhà đầu tư', priority: 'high', assigneeId: 'e2b5c710-4d8a-493e-91c2-6a8b0e5d4f12', dueDate: '2026-08-01' },
  //   ],
  // },
};

export const DEFAULT_BOARD_ID = 'b-1';

/** Board rỗng dùng làm fallback khi MOCK_BOARDS trống (test trắng hoàn toàn) — giữ
 *  boardSeed() không bao giờ trả về undefined dù DEFAULT_BOARD_ID chưa có seed nào. */
const EMPTY_SEED: Omit<MockBoardSeed, 'id'> = {
  name: '',
  workspaceId: '',
  visibility: 'restricted',
  background: 'bg-board-blue',
  lists: [],
  cards: [],
};

/** Seed của 1 board theo id — board lạ (id tự tạo) rơi về b-1 nhưng giữ đúng id truyền vào. */
export function boardSeed(boardId: string): MockBoardSeed {
  const seed = MOCK_BOARDS[boardId];
  return seed ?? { ...(MOCK_BOARDS[DEFAULT_BOARD_ID] ?? EMPTY_SEED), id: boardId };
}

export const ALL_MOCK_BOARD_IDS = Object.keys(MOCK_BOARDS);
