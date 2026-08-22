import { Component, computed, effect, inject, input, output } from '@angular/core';
import { Board, User } from '../../../models';
import { BoardService, avatarColorFor, initialsOf, relativeTimeFrom } from '../../../services/board.service';
import { ChatService } from '../../../services/chat.service';

interface ConversationRow {
  board: Board;
  lastMessageText: string | null;
  lastSenderLabel: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  avatarColor: string;
  avatarInitials: string;
}

/**
 * Sidebar hội thoại kiểu Messenger (#chat-hub, Level 1) — cột trái cố định, luôn hiển thị.
 * Chọn 1 dòng chỉ đổi `selectedBoardId` (Dashboard render khung chat ngay tại chỗ qua
 * DashboardChatThread), KHÔNG điều hướng sang /board/:id nữa. Mục "Tổng quan" ghim đầu
 * danh sách là lối duy nhất để quay lại nội dung Tổng quan mặc định của Dashboard.
 */
@Component({
  selector: 'app-dashboard-chat',
  imports: [],
  templateUrl: './dashboard-chat.html',
  styleUrl: './dashboard-chat.css',
})
export class DashboardChat {
  private readonly boardService = inject(BoardService);
  private readonly chat = inject(ChatService);

  readonly relativeTimeFrom = relativeTimeFrom;

  readonly selectedBoardId = input<string | null>(null);
  /** Ẩn sidebar này trên màn hình nhỏ khi đã chọn 1 mục (Tổng quan/hội thoại) — kiểu
   *  điều hướng "danh sách ↔ chi tiết" của Messenger mobile, xem Dashboard#mobileView. */
  readonly hiddenOnMobile = input(false);
  readonly selectBoard = output<Board | null>();

  readonly conversations = computed<ConversationRow[]>(() => {
    const members = this.boardService.members();
    const membersById: Record<string, User | undefined> = {};
    for (const m of members) membersById[m.id] = m;

    const me = this.chat.currentUserId();
    const rows = this.boardService.allBoards().map((board): ConversationRow => {
      const preview = this.chat.getConversationPreview(board.id);
      const last = preview.lastMessage;
      const sender = last ? membersById[last.userId] : undefined;
      return {
        board,
        lastMessageText: last?.content ?? null,
        lastSenderLabel: last ? (last.userId === me ? 'Bạn' : (sender?.displayName ?? sender?.email ?? 'Ẩn danh')) : null,
        lastMessageAt: last?.createdAt ?? null,
        unreadCount: preview.unreadCount,
        avatarColor: avatarColorFor(board.id),
        avatarInitials: initialsOf(board.name),
      };
    });

    // Mới nhất trước (#2) — board chưa có tin nào rơi xuống cuối.
    rows.sort((a, b) => (b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0) - (a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0));
    return rows;
  });

  readonly totalUnread = computed(() => this.conversations().reduce((sum, c) => sum + c.unreadCount, 0));

  constructor() {
    void this.boardService.loadAllBoards();

    // Danh sách board về sau (bất đồng bộ) → lúc đó mới đi lấy tin cuối của từng
    // board. `loadPreviews` tự bỏ qua board đã nạp nên effect chạy lại nhiều lần
    // cũng không gọi lại API.
    effect(() => {
      const ids = this.boardService.allBoards().map((b) => b.id);
      if (ids.length) void this.chat.loadPreviews(ids);
    });
  }

  selectOverview(): void {
    this.selectBoard.emit(null);
  }

  selectConversation(board: Board): void {
    this.selectBoard.emit(board);
  }

  trackByBoardId(_: number, row: ConversationRow): string {
    return row.board.id;
  }
}
