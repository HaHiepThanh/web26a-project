import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiCreatedMessage, ApiMessage, Message, User } from '../models';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { describeError } from './api-error.util';

/** Số tin giữ lại cho mỗi board ở phần xem trước Dashboard — chỉ cần đủ để đếm
 *  "chưa đọc", không cần cả lịch sử. */
const PREVIEW_KEEP = 30;

const LAST_SEEN_KEY = 'trello_chat_lastseen';

function loadLastSeen(): Record<string, number> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LAST_SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/**
 * [AI-CHAT] Khung chat theo board (#8) — GỌI BACKEND THẬT + nhận tin mới qua WebSocket.
 *
 * Không còn nguồn dữ liệu giả nào ở đây. Trước kia `getConversationPreview()` dựng
 * tin nhắn từ hằng số `MESSAGE_SETS` nên danh sách hội thoại ở Dashboard hiển thị
 * nội dung không có thật (và sau khi comment hết dữ liệu mẫu thì luôn rỗng).
 * Giờ mọi thứ đến từ `GET /chat?boardId=`.
 *
 * Tin nhắn của người khác KHÔNG do service này đi hỏi định kỳ: `RealtimeService`
 * nhận sự kiện `chat.message` từ server rồi gọi `applyIncoming()`.
 *
 * Phần "AI bắt ý để tạo thẻ" KHÔNG nằm ở đây: server phân tích ngay trong
 * `POST /chat` rồi phát gợi ý cho cả board — xem `TaskSuggestionService`.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly messages = signal<Message[]>([]);
  readonly loadError = signal<string | null>(null);

  /** uid thật của "Bạn" — quyết định tin nào căn phải, tin nào tính là chưa đọc. */
  readonly currentUserId = this.auth.currentUserId;

  /** Vài tin gần nhất của từng board, cho danh sách hội thoại ở Dashboard (#chat-hub).
   *  Tách khỏi `messages` (state của board đang mở) để hai bên không đè nhau. */
  private readonly previewByBoard = signal<Record<string, Message[]>>({});

  /** Mốc "đã xem tới đâu" của từng board. Là signal chứ không đọc thẳng localStorage:
   *  có vậy bấm vào một hội thoại xong thì badge chưa-đọc mới tự tắt. */
  private readonly lastSeenAt = signal<Record<string, number>>(loadLastSeen());

  private loadedBoardId: string | null = null;

  /** Tổng số tin chưa đọc trên mọi board — Header dùng để chấm badge 💬. */
  readonly totalUnread = computed(() => {
    const me = this.currentUserId();
    const seen = this.lastSeenAt();
    let total = 0;
    for (const [boardId, msgs] of Object.entries(this.previewByBoard())) {
      const mark = seen[boardId] ?? 0;
      total += msgs.filter((m) => m.userId !== me && Date.parse(m.createdAt) > mark).length;
    }
    return total;
  });

  private toMessage(r: ApiMessage, boardId: string): Message {
    return {
      id: r.id,
      orgId: '',
      boardId,
      userId: r.userId,
      content: r.content,
      createdAt: r.createdAt,
    };
  }

  async loadMessages(boardId: string, force = false): Promise<void> {
    if (!boardId) {
      this.messages.set([]);
      return;
    }
    if (!force && this.loadedBoardId === boardId) return;
    this.loadedBoardId = boardId;
    try {
      const rows = await this.api.get<ApiMessage[]>(`/chat?boardId=${encodeURIComponent(boardId)}`);
      const list = rows.map((r) => this.toMessage(r, boardId));
      this.messages.set(list);
      this.cachePreview(boardId, list);
    } catch (e) {
      this.messages.set([]);
      this.loadError.set(describeError(e, 'Không tải được tin nhắn.'));
    }
  }

  /** Gửi tin nhắn rồi chạy AI phát hiện task (#8).
   *  Không tự thêm vào `messages` — server sẽ phát lại qua WebSocket cho MỌI người
   *  đang mở board, kể cả người gửi, nên thêm ở đây là hiện hai lần. */
  async sendMessage(boardId: string, content: string, members: User[]): Promise<void> {
    const trimmed = content.trim();
    if (!trimmed) return;

    let message: Message;
    try {
      const row = await this.api.post<ApiCreatedMessage>('/chat', { boardId, content: trimmed });
      message = {
        id: row.id,
        orgId: row.orgId,
        boardId: row.boardId,
        userId: row.userId,
        content: row.content,
        createdAt: row.createdAt,
      };
    } catch (e) {
      this.loadError.set(describeError(e, 'Không gửi được tin nhắn.'));
      return;
    }
    this.applyIncoming(message);

    // KHÔNG phân tích AI ở đây nữa. Server tự làm trong `POST /chat` rồi phát gợi
    // ý qua WebSocket cho CẢ BOARD — xem TaskSuggestionService.
  }

  /**
   * Thêm 1 tin vào state — dùng cho cả tin mình vừa gửi lẫn tin nhận qua WebSocket.
   *
   * Chống trùng theo id: người gửi vừa thêm tại chỗ xong thì server cũng phát sự
   * kiện về, nếu không lọc thì tin của chính mình hiện hai lần.
   */
  applyIncoming(message: Message): void {
    if (this.loadedBoardId === message.boardId) {
      this.messages.update((all) => (all.some((m) => m.id === message.id) ? all : [...all, message]));
    }
    this.previewByBoard.update((map) => {
      const current = map[message.boardId] ?? [];
      if (current.some((m) => m.id === message.id)) return map;
      return { ...map, [message.boardId]: [...current, message].slice(-PREVIEW_KEEP) };
    });
  }

  // ---- Dashboard Chat hub (#chat-hub) ----

  /** Nạp tin gần nhất của nhiều board cùng lúc để vẽ danh sách hội thoại.
   *  Gọi song song: 5 board là 5 request chạy đồng thời, không phải chờ nối đuôi. */
  async loadPreviews(boardIds: string[]): Promise<void> {
    const missing = boardIds.filter((id) => id && !(id in this.previewByBoard()));
    if (!missing.length) return;

    const results = await Promise.all(
      missing.map(async (boardId) => {
        try {
          const rows = await this.api.get<ApiMessage[]>(`/chat?boardId=${encodeURIComponent(boardId)}`);
          return [boardId, rows.map((r) => this.toMessage(r, boardId))] as const;
        } catch {
          // Một board hỏng không được làm hỏng cả danh sách — coi như chưa có tin.
          return [boardId, [] as Message[]] as const;
        }
      }),
    );

    this.previewByBoard.update((map) => {
      const next = { ...map };
      for (const [boardId, msgs] of results) next[boardId] = msgs.slice(-PREVIEW_KEEP);
      return next;
    });
  }

  private cachePreview(boardId: string, list: Message[]): void {
    this.previewByBoard.update((map) => ({ ...map, [boardId]: list.slice(-PREVIEW_KEEP) }));
  }

  /** Tin cuối + số tin chưa đọc của 1 board. Đọc từ signal nên tự vẽ lại khi có
   *  tin mới qua WebSocket hoặc khi người dùng bấm `markSeen`. */
  getConversationPreview(boardId: string): { lastMessage: Message | null; unreadCount: number } {
    const msgs = this.previewByBoard()[boardId] ?? [];
    const me = this.currentUserId();
    const mark = this.lastSeenAt()[boardId] ?? 0;
    return {
      lastMessage: msgs[msgs.length - 1] ?? null,
      unreadCount: msgs.filter((m) => m.userId !== me && Date.parse(m.createdAt) > mark).length,
    };
  }

  /** Gọi khi người dùng thực sự đã mở/xem chat của 1 board — board đó hết "chưa đọc". */
  markSeen(boardId: string): void {
    const next = { ...this.lastSeenAt(), [boardId]: Date.now() };
    this.lastSeenAt.set(next);
    try {
      localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(next));
    } catch {
      /* hết quota thì thôi, chỉ mất mốc đã đọc */
    }
  }
}

