import { loadLastSeen } from './chat.local-seen.util';

export interface ChatOwnState {
  /** Board đang hiển thị đầy đủ (trang Board/DashboardChatThread) — `messages()`
   *  chỉ lọc đúng board này, y hệt `loadedBoardId` của `chat.service.ts` cũ. */
  loadedBoardId: string | null;
  /** Mốc "đã xem tới đâu" theo board — nguồn cho badge chưa-đọc. */
  lastSeenAt: Record<string, number>;
  /** Còn tin cũ hơn để cuộn lên không, theo board. Thiếu khoá = chưa biết. */
  hasMore: Record<string, boolean>;
  /**
   * Đang tải trang cũ hơn.
   *
   * ⚠️ BẮT BUỘC. Mỗi trang chỉ 10 tin nên thường KHÔNG lấp đầy màn hình → mốc
   *    canh ở đầu danh sách vẫn nằm trong tầm nhìn → IntersectionObserver bắn
   *    tiếp ngay. Không có cờ này thì 3–4 request cùng bay đi với CÙNG một con
   *    trỏ, và tin bị nhân bản trong danh sách.
   */
  dangTaiThem: boolean;
}

export const initialChatState: ChatOwnState = {
  loadedBoardId: null,
  lastSeenAt: loadLastSeen(),
  hasMore: {},
  dangTaiThem: false,
};
