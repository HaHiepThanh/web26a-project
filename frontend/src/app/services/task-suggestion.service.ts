import { Injectable, computed, inject, signal } from '@angular/core';
import { ChatTaskSuggestion, SuggestedCard } from '../models';
import { ApiService } from './api.service';
import { describeError } from './api-error.util';

/**
 * Gợi ý tạo thẻ do AI phát hiện trong chat — GỌI BACKEND THẬT.
 *
 * ⚠️ Frontend KHÔNG gọi Gemini. Server phân tích ngay trong luồng `POST /chat`,
 *    lưu xuống database rồi phát qua WebSocket. Service này chỉ đọc, chấp nhận,
 *    hoặc bỏ qua.
 *
 *    `services/ai.service.ts` cũ (dò từ khoá tại chỗ rồi lấy nguyên câu chat làm
 *    tên thẻ) đã bị xoá: giữ lại một bản đoán mò ở client bên cạnh bản thật ở
 *    server chỉ tạo ra hai nguồn sự thật mâu thuẫn nhau.
 */
@Injectable({ providedIn: 'root' })
export class TaskSuggestionService {
  private readonly api = inject(ApiService);

  /** Gợi ý đang chờ, theo board. */
  readonly byBoard = signal<Record<string, ChatTaskSuggestion[]>>({});
  readonly lastError = signal<{ id: number; message: string } | null>(null);
  private errorSeq = 0;

  /** Gợi ý đang mở trong modal. `null` = modal đóng. */
  readonly opened = signal<ChatTaskSuggestion | null>(null);

  /** Tra nhanh theo messageId — khung chat vẽ chip ngay dưới đúng tin nhắn đó. */
  readonly byMessageId = computed(() => {
    const map: Record<string, ChatTaskSuggestion | undefined> = {};
    for (const list of Object.values(this.byBoard())) {
      for (const s of list) map[s.messageId] = s;
    }
    return map;
  });

  private fail(message: string): void {
    this.errorSeq++;
    this.lastError.set({ id: this.errorSeq, message });
  }

  suggestionsFor(boardId: string): ChatTaskSuggestion[] {
    return this.byBoard()[boardId] ?? [];
  }

  async loadSuggestions(boardId: string): Promise<void> {
    if (!boardId) return;
    try {
      const rows = await this.api.get<ChatTaskSuggestion[]>(
        `/task-suggestions?boardId=${encodeURIComponent(boardId)}`,
      );
      this.byBoard.update((map) => ({ ...map, [boardId]: rows }));
    } catch {
      // Không báo lỗi ồn ào: mất gợi ý chỉ làm thiếu một tiện ích, không chặn
      // người dùng làm gì cả.
      this.byBoard.update((map) => ({ ...map, [boardId]: [] }));
    }
  }

  open(suggestion: ChatTaskSuggestion): void {
    this.opened.set(suggestion);
  }

  close(): void {
    this.opened.set(null);
  }

  /**
   * Chấp nhận → tạo thẻ thật. `cards` là danh sách ĐÃ SỬA trong modal.
   *
   * Trả về `null` khi thành công, hoặc câu lỗi. Hai người cùng bấm thì người thứ
   * hai nhận 409 — server chặn, không tạo ra bộ thẻ trùng.
   */
  async accept(suggestion: ChatTaskSuggestion, cards: SuggestedCard[]): Promise<string | null> {
    try {
      await this.api.post(`/task-suggestions/${suggestion.id}/accept`, { cards });
      this.removeLocally(suggestion);
      this.close();
      return null;
    } catch (e) {
      // Gợi ý đã bị người khác xử lý → gỡ khỏi màn hình luôn, giữ lại chỉ gây rối.
      this.removeLocally(suggestion);
      this.close();
      return describeError(e, 'Không tạo được thẻ từ gợi ý.');
    }
  }

  async dismiss(suggestion: ChatTaskSuggestion): Promise<void> {
    this.removeLocally(suggestion);
    this.close();
    try {
      await this.api.post(`/task-suggestions/${suggestion.id}/dismiss`, {});
    } catch (e) {
      this.fail(describeError(e, 'Không bỏ qua được gợi ý.'));
    }
  }

  // ---- Nhận từ WebSocket ----

  /** Upsert theo id — sự kiện có thể về TRƯỚC phản hồi HTTP của chính mình. */
  applyRemoteCreated(s: ChatTaskSuggestion): void {
    this.byBoard.update((map) => {
      const current = map[s.boardId] ?? [];
      if (current.some((x) => x.id === s.id)) return map;
      return { ...map, [s.boardId]: [...current, s] };
    });
  }

  /** Ai đó đã chấp nhận/bỏ qua ở máy khác → gỡ chip ở đây luôn. */
  applyRemoteResolved(id: string): void {
    this.byBoard.update((map) => {
      const next: Record<string, ChatTaskSuggestion[]> = {};
      for (const [boardId, list] of Object.entries(map)) {
        next[boardId] = list.filter((s) => s.id !== id);
      }
      return next;
    });
    if (this.opened()?.id === id) this.close();
  }

  private removeLocally(s: ChatTaskSuggestion): void {
    this.byBoard.update((map) => ({
      ...map,
      [s.boardId]: (map[s.boardId] ?? []).filter((x) => x.id !== s.id),
    }));
  }
}
