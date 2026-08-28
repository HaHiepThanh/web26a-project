import { inject, Signal } from '@angular/core';
import { patchState, WritableStateSource } from '@ngrx/signals';
import { EntityState, upsertEntities, upsertEntity } from '@ngrx/signals/entities';
import { ApiMessage, ApiMessagePage, Message, User } from '../../models';
import { ApiService } from '../../services/api.service';
import { describeError } from '../../services/api-error.util';
import { ChatOwnState } from './chat.state';
import { toMessage } from './chat.mapper';
import { persistLastSeen } from './chat.local-seen.util';

/** Số tin giữ lại cho mỗi board ở phần xem trước Dashboard — chỉ cần đủ để đếm
 *  "chưa đọc", không cần cả lịch sử. */
const PREVIEW_KEEP = 30;

/** Tin mỗi trang khi cuộn lên. Khớp mặc định của backend. */
export const TRANG = 10;

type Store = WritableStateSource<EntityState<Message> & ChatOwnState> & {
  entities: Signal<Message[]>;
  byBoard: Signal<Record<string, Message[]>>;
  currentUserId: Signal<string>;
  lastSeenAt: Signal<Record<string, number>>;
  loadedBoardId: Signal<string | null>;
  hasMore: Signal<Record<string, boolean>>;
  dangTaiThem: Signal<boolean>;
  fail: (message: string) => void;
};

/** Tin CŨ NHẤT đang giữ của một board — điểm neo cho trang kế tiếp. */
function cuNhat(store: Store, boardId: string): Message | null {
  const ds = store.byBoard()[boardId] ?? [];
  if (!ds.length) return null;
  return [...ds].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
}

/** Con trỏ khoá `<createdAt>_<id>` — xem `chat.service.ts` về lý do không dùng OFFSET. */
function conTro(m: Message): string {
  return `${m.createdAt}_${m.id}`;
}

/** Hàm generic thuần — xem chú thích trong `ngrx/list/list.computed.ts` (và
 *  `ngrx/list/list.methods.ts` về việc `inject(ApiService)` chỉ gọi một lần ở đây). */
export function chatMethods<S extends Store>(store: S, api = inject(ApiService)) {
  return {
    /** Trang ĐẦU (mới nhất) của một board. */
    async loadMessages(boardId: string, force = false): Promise<void> {
      if (!boardId) {
        patchState(store, { loadedBoardId: null });
        return;
      }
      if (!force && store.loadedBoardId() === boardId) return;
      patchState(store, { loadedBoardId: boardId });
      try {
        const trang = await api.get<ApiMessagePage>(
          `/chat?boardId=${encodeURIComponent(boardId)}&limit=${TRANG}`,
        );
        patchState(store, upsertEntities(trang.messages.map(toMessage)), {
          hasMore: { ...store.hasMore(), [boardId]: trang.hasMore },
        });
      } catch (e) {
        store.fail(describeError(e, 'Failed to load messages.'));
      }
    },

    /**
     * Trang CŨ HƠN — gọi khi mốc canh ở đầu danh sách lọt vào tầm nhìn.
     *
     * Trả về `true` nếu có nạp thêm được tin, để chỗ gọi biết còn nên thử tiếp
     * hay không (ví dụ khi đang lần ngược tìm một tin bị trích dẫn).
     */
    async loadOlder(boardId: string): Promise<boolean> {
      if (!boardId || store.dangTaiThem()) return false;
      if (store.hasMore()[boardId] === false) return false;

      const neo = cuNhat(store, boardId);
      if (!neo) return false;

      patchState(store, { dangTaiThem: true });
      try {
        const trang = await api.get<ApiMessagePage>(
          `/chat?boardId=${encodeURIComponent(boardId)}&limit=${TRANG}&before=${encodeURIComponent(conTro(neo))}`,
        );
        patchState(store, upsertEntities(trang.messages.map(toMessage)), {
          hasMore: { ...store.hasMore(), [boardId]: trang.hasMore },
        });
        return trang.messages.length > 0;
      } catch (e) {
        store.fail(describeError(e, 'Failed to load older messages.'));
        return false;
      } finally {
        patchState(store, { dangTaiThem: false });
      }
    },

    /** Gửi tin nhắn rồi chạy AI phát hiện task (#8) — SERVER lo, không phải ở đây.
     *  Không tự thêm ở đây theo kiểu "add": server phát lại qua WebSocket cho MỌI
     *  người đang mở board, kể cả người gửi — `applyIncoming` dùng upsert. */
    async sendMessage(
      boardId: string,
      content: string,
      members: User[],
      replyToId?: string,
    ): Promise<void> {
      void members; // giữ tham số để khớp chữ ký cũ — server tự đối chiếu thành viên.
      const trimmed = content.trim();
      if (!trimmed) return;
      try {
        const row = await api.post<ApiMessage>('/chat', {
          boardId,
          content: trimmed,
          ...(replyToId ? { replyToId } : {}),
        });
        this.applyIncoming(toMessage(row));
      } catch (e) {
        store.fail(describeError(e, 'Failed to send message.'));
      }
    },

    /** Sửa nội dung. Server kiểm quyền; ẩn nút ở UI chỉ là phép lịch sự. */
    async editMessage(id: string, content: string): Promise<void> {
      const trimmed = content.trim();
      if (!trimmed) return;
      try {
        const row = await api.patch<ApiMessage>(`/chat/${id}`, { content: trimmed });
        this.applyUpdated(toMessage(row));
      } catch (e) {
        store.fail(describeError(e, 'Failed to edit message.'));
      }
    },

    /** Thu hồi — dòng vẫn còn, chỉ mất nội dung. */
    async recallMessage(id: string): Promise<void> {
      try {
        const row = await api.delete<ApiMessage>(`/chat/${id}`);
        this.applyUpdated(toMessage(row));
      } catch (e) {
        store.fail(describeError(e, 'Failed to recall message.'));
      }
    },

    /** Thêm 1 tin vào state — dùng cho cả tin mình vừa gửi lẫn tin nhận qua
     *  WebSocket. Upsert theo id chống trùng (mục 3 + mục 5 của tài liệu). */
    applyIncoming(message: Message): void {
      patchState(store, upsertEntity(message));
    },

    /**
     * Một tin vừa được sửa hoặc thu hồi.
     *
     * ⚠️ Phải vá luôn MỌI Ô TRÍCH DẪN đang trỏ tới nó. Ô trích dẫn là bản chụp
     *    nội dung tại lúc tải trang; chỉ cập nhật mỗi tin gốc thì câu trả lời
     *    vẫn trưng nguyên văn thứ vừa bị thu hồi.
     */
    applyUpdated(message: Message): void {
      const keoTheo = store
        .entities()
        .filter((m) => m.replyTo?.id === message.id)
        .map((m) => ({
          ...m,
          replyTo: {
            ...m.replyTo!,
            content: message.content,
            deletedAt: message.deletedAt ?? null,
          },
        }));
      patchState(store, upsertEntities([message, ...keoTheo]));
    },

    // ---- Dashboard Chat hub (#chat-hub) ----

    /** Nạp tin gần nhất của nhiều board cùng lúc — chạy song song. */
    async loadPreviews(boardIds: string[]): Promise<void> {
      const missing = boardIds.filter((id) => id && !(id in store.byBoard()));
      if (!missing.length) return;

      const results = await Promise.all(
        missing.map(async (boardId) => {
          try {
            // Xin đúng PREVIEW_KEEP: phần xem trước đếm "chưa đọc" trong ngần
            // ấy tin, lấy trang mặc định 10 thì badge chặn ở 10 dù có 25 tin chưa đọc.
            const trang = await api.get<ApiMessagePage>(
              `/chat?boardId=${encodeURIComponent(boardId)}&limit=${PREVIEW_KEEP}`,
            );
            return trang.messages.map(toMessage);
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
      const all = [...(store.byBoard()[boardId] ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
