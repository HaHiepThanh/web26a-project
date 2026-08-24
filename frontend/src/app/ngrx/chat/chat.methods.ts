import { inject, Signal } from '@angular/core';
import { patchState, WritableStateSource } from '@ngrx/signals';
import { EntityState, upsertEntities, upsertEntity } from '@ngrx/signals/entities';
import { ApiCreatedMessage, ApiMessage, Message, User } from '../../models';
import { ApiService } from '../../services/api.service';
import { describeError } from '../../services/api-error.util';
import { ChatOwnState } from './chat.state';
import { createdToMessage, toMessage } from './chat.mapper';
import { persistLastSeen } from './chat.local-seen.util';

/** Số tin giữ lại cho mỗi board ở phần xem trước Dashboard — chỉ cần đủ để đếm
 *  "chưa đọc", không cần cả lịch sử. */
const PREVIEW_KEEP = 30;

type Store = WritableStateSource<EntityState<Message> & ChatOwnState> & {
  byBoard: Signal<Map<string, Message[]>>;
  currentUserId: Signal<string>;
  lastSeenAt: Signal<Record<string, number>>;
  loadedBoardId: Signal<string | null>;
  fail: (message: string) => void;
};

/** Hàm generic thuần — xem chú thích trong `ngrx/list/list.computed.ts` (và
 *  `ngrx/list/list.methods.ts` về việc `inject(ApiService)` chỉ gọi một lần ở đây). */
export function chatMethods<S extends Store>(store: S, api = inject(ApiService)) {
  return {
    async loadMessages(boardId: string, force = false): Promise<void> {
      if (!boardId) {
        patchState(store, { loadedBoardId: null });
        return;
      }
      if (!force && store.loadedBoardId() === boardId) return;
      patchState(store, { loadedBoardId: boardId });
      try {
        const rows = await api.get<ApiMessage[]>(`/chat?boardId=${encodeURIComponent(boardId)}`);
        patchState(store, upsertEntities(rows.map((r) => toMessage(r, boardId))));
      } catch (e) {
        store.fail(describeError(e, 'Failed to load messages.'));
      }
    },

    /** Gửi tin nhắn rồi chạy AI phát hiện task (#8) — SERVER lo, không phải ở đây.
     *  Không tự thêm ở đây theo kiểu "add": server phát lại qua WebSocket cho MỌI
     *  người đang mở board, kể cả người gửi — `applyIncoming` dùng upsert. */
    async sendMessage(boardId: string, content: string, members: User[]): Promise<void> {
      void members; // giữ tham số để khớp chữ ký cũ — server tự đối chiếu thành viên.
      const trimmed = content.trim();
      if (!trimmed) return;
      try {
        const row = await api.post<ApiCreatedMessage>('/chat', { boardId, content: trimmed });
        this.applyIncoming(createdToMessage(row));
      } catch (e) {
        store.fail(describeError(e, 'Failed to send message.'));
      }
    },

    /** Thêm 1 tin vào state — dùng cho cả tin mình vừa gửi lẫn tin nhận qua
     *  WebSocket. Upsert theo id chống trùng (mục 3 + mục 5 của tài liệu). */
    applyIncoming(message: Message): void {
      patchState(store, upsertEntity(message));
    },

    // ---- Dashboard Chat hub (#chat-hub) ----

    /** Nạp tin gần nhất của nhiều board cùng lúc — chạy song song. */
    async loadPreviews(boardIds: string[]): Promise<void> {
      const missing = boardIds.filter((id) => id && !store.byBoard().has(id));
      if (!missing.length) return;

      const results = await Promise.all(
        missing.map(async (boardId) => {
          try {
            const rows = await api.get<ApiMessage[]>(`/chat?boardId=${encodeURIComponent(boardId)}`);
            return rows.map((r) => toMessage(r, boardId));
          } catch {
            // Một board hỏng không được làm hỏng cả danh sách.
            return [] as Message[];
          }
        }),
      );
      patchState(store, upsertEntities(results.flat()));
    },

    /** Tin cuối + số tin chưa đọc của 1 board, giới hạn `PREVIEW_KEEP` tin gần nhất. */
    getConversationPreview(boardId: string): { lastMessage: Message | null; unreadCount: number } {
      const all = [...(store.byBoard().get(boardId) ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const msgs = all.slice(-PREVIEW_KEEP);
      const me = store.currentUserId();
      const mark = store.lastSeenAt()[boardId] ?? 0;
      return {
        lastMessage: msgs[msgs.length - 1] ?? null,
        unreadCount: msgs.filter((m) => m.userId !== me && Date.parse(m.createdAt) > mark).length,
      };
    },

    /** Gọi khi người dùng thực sự đã mở/xem chat của 1 board. */
    markSeen(boardId: string): void {
      const next = { ...store.lastSeenAt(), [boardId]: Date.now() };
      patchState(store, { lastSeenAt: next });
      persistLastSeen(next);
    },
  };
}
