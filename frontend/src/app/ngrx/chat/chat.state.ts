import { loadLastSeen } from './chat.local-seen.util';

export interface ChatOwnState {
  /** Board đang hiển thị đầy đủ (trang Board/DashboardChatThread) — `messages()`
   *  chỉ lọc đúng board này, y hệt `loadedBoardId` của `chat.service.ts` cũ. */
  loadedBoardId: string | null;
  /** Mốc "đã xem tới đâu" theo board — nguồn cho badge chưa-đọc. */
  lastSeenAt: Record<string, number>;
}

export const initialChatState: ChatOwnState = {
  loadedBoardId: null,
  lastSeenAt: loadLastSeen(),
};
