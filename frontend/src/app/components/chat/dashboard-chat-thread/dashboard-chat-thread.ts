import { Component, computed, effect, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Board, User } from '../../../models';
import { BoardService, avatarColorFor, initialsOf } from '../../../services/board.service';
import { ChatService } from '../../../services/chat.service';
import { CardService } from '../../../services/card.service';
import { ListService } from '../../../services/list.service';
import { RealtimeService } from '../../../services/realtime.service';
import { OrganizationService } from '../../../services/organization.service';
import { MessageList } from '../message-list/message-list';
import { ChatInput } from '../chat-input/chat-input';

/**
 * Khung chat của 1 board, nhúng thẳng vào panel chính của Dashboard (thay cho việc
 * điều hướng sang /board/:id) — chọn hội thoại nào ở DashboardChat (sidebar trái) thì
 * `board` input đổi theo, effect dưới nạp lại lists/cards/messages đúng board đó.
 * Tái dùng MessageList/ChatInput + toàn bộ luồng gợi ý AI y hệt ChatPanel (#board chat),
 * chỉ bỏ phần chrome riêng của panel dock (resize/collapse/badge/toast/đổi tiêu đề tab)
 * vì ở đây đã là khu vực nội dung chính, không phải panel nổi ẩn/hiện.
 */
@Component({
  selector: 'app-dashboard-chat-thread',
  imports: [MessageList, ChatInput, RouterLink],
  templateUrl: './dashboard-chat-thread.html',
  styleUrl: './dashboard-chat-thread.css',
})
export class DashboardChatThread {
  private readonly boardService = inject(BoardService);
  private readonly orgService = inject(OrganizationService);

  /** Link mở board đầy đủ — phải kèm slug tổ chức vì route là /:orgSlug/board/:id. */
  readonly boardLink = computed(() => ['/', this.orgService.activeOrgSlug(), 'board', this.board().id]);
  private readonly chat = inject(ChatService);
  private readonly cardService = inject(CardService);
  private readonly listService = inject(ListService);
  private readonly realtime = inject(RealtimeService);

  readonly board = input.required<Board>();
  /** Nút "←" chỉ hiện trên màn hình nhỏ (md:hidden) — báo Dashboard quay lại sidebar. */
  readonly back = output<void>();

  readonly avatarColor = computed(() => avatarColorFor(this.board().id));
  readonly avatarInitials = computed(() => initialsOf(this.board().name));

  readonly members = this.boardService.members;
  readonly currentUserId = this.chat.currentUserId;
  readonly messages = this.chat.messages;

  readonly usersById = computed(() => {
    const map: Record<string, User | undefined> = {};
    for (const m of this.members()) map[m.id] = m;
    return map;
  });
  readonly memberNames = computed(() => this.members().map((m) => m.displayName ?? m.email));

  readonly pendingSuggestion = computed(() => this.chat.pendingSuggestion()?.suggestion ?? null);
  readonly pendingAssigneeName = computed(() => {
    const s = this.chat.pendingSuggestion()?.suggestion;
    if (!s?.assigneeId) return null;
    const u = this.usersById()[s.assigneeId];
    return u?.displayName ?? u?.email ?? null;
  });

  constructor() {
    // effect() (không phải constructor body trực tiếp) vì input.required() chỉ có
    // giá trị SAU khi Angular gán input — giống lý do ChatPanel dùng effect cho boardId().
    effect(() => {
      void this.bootstrap(this.board().id);
    });

    // Vào phòng WebSocket của board đang xem để tin nhắn về ngay, không phải F5.
    // `onCleanup` chạy khi người dùng đổi sang hội thoại khác HOẶC rời trang —
    // thiếu nó thì mỗi lần bấm sang board khác lại chồng thêm một lượt lắng nghe.
    effect((onCleanup) => {
      const roiPhong = this.realtime.joinBoard(this.board().id);
      onCleanup(roiPhong);
    });
  }

  private async bootstrap(boardId: string): Promise<void> {
    await this.listService.loadLists(boardId);
    const listIds = this.listService.lists().map((l) => l.id);
    await this.cardService.loadCards(boardId);
    await this.chat.loadMessages(boardId);
    this.chat.markSeen(boardId);
  }

  async onSend(content: string): Promise<void> {
    await this.chat.sendMessage(this.board().id, content, this.members());
  }

  async confirmSuggestion(): Promise<void> {
    const pending = this.chat.pendingSuggestion();
    if (!pending) return;
    const targetList = [...this.listService.lists()].sort((a, b) => a.position - b.position)[0];
    if (!targetList) return;
    const card = await this.cardService.createCard(targetList.id, {
      title: pending.suggestion.title,
      priority: 'medium',
      assigneeId: pending.suggestion.assigneeId,
      dueDate: pending.suggestion.dueDate,
    });
    this.chat.dismissSuggestion();
    // 'card_created' do backend ghi (POST /cards), không ghi lại ở đây.
  }

  dismissSuggestion(): void {
    this.chat.dismissSuggestion();
  }
}
