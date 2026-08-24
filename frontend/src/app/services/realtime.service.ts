import { Injectable, inject, signal } from '@angular/core';
import { Socket, io } from 'socket.io-client';
import { environment } from '../../environments/environment';
import {
  ApiBoard,
  ApiCard,
  ApiAttachment,
  ApiChecklistItem,
  ApiComment,
  ApiCreatedMessage,
  ApiLabel,
  ApiList,
  ActivityLog,
  BoardEvent,
  BoardViewer,
  Comment,
  CardAssignedPayload,
  ChatTaskSuggestion,
  OrgInvite,
  OrgInviteRole,
  PresenceEvent,
  UserEvent,
  WS,
} from '../models';
import { FirebaseService } from './firebase.service';
import { ActivityService } from './activity.service';
import { BoardService } from './board.service';
import { CardStore } from '../ngrx/card/card.store';
import { ChatService } from './chat.service';
import { AttachmentStore } from '../ngrx/attachment/attachment.store';
import { ChecklistStore } from '../ngrx/checklist/checklist.store';
import { CommentStore } from '../ngrx/comment/comment.store';
import { LabelStore } from '../ngrx/label/label.store';
import { ListService } from './list.service';
import { NotificationService } from './notification.service';
import { OrganizationService } from './organization.service';
import { TaskSuggestionService } from './task-suggestion.service';

/**
 * REALTIME THEO BOARD — mở board là thấy thay đổi của người khác ngay, không F5.
 *
 * ── Vì sao Socket.IO qua backend chứ không phải Supabase Realtime?
 * File này trước đây là stub ghi "subscribe postgres_changes của Supabase". Làm
 * vậy thì frontend phải cầm khoá Supabase và dựa vào RLS để chặn — trong khi cả
 * dự án được xây theo hướng ngược lại: frontend KHÔNG có khoá Supabase nào, mọi
 * thứ đi qua backend, và chính backend mới là nơi kiểm tra quyền. Mở thêm một
 * đường thẳng xuống database là đi vòng qua toàn bộ chốt chặn đó.
 *
 * ── Cách dùng: trang Board gọi `joinBoard(id)` và gọi hàm nó trả về khi rời trang.
 *
 * ── Vì sao service này tự áp thay đổi vào các service dữ liệu, thay vì bắn ra
 *    ngoài cho component tự xử lý? Vì cùng một board có thể mở ở nhiều nơi (trang
 *    Board, khung chat Dashboard). Gom một chỗ thì chỉ có ĐÚNG MỘT nơi biết cách
 *    áp mỗi loại sự kiện.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly firebase = inject(FirebaseService);
  private readonly lists = inject(ListService);
  private readonly cards = inject(CardStore);
  private readonly labels = inject(LabelStore);
  private readonly comments = inject(CommentStore);
  private readonly checklist = inject(ChecklistStore);
  private readonly attachments = inject(AttachmentStore);
  private readonly chat = inject(ChatService);
  private readonly activity = inject(ActivityService);
  private readonly boards = inject(BoardService);
  private readonly organizations = inject(OrganizationService);
  private readonly notifications = inject(NotificationService);
  private readonly taskSuggestions = inject(TaskSuggestionService);

  /** Ai đang mở board hiện tại (kể cả mình) — thanh tiêu đề vẽ dãy avatar. */
  readonly viewers = signal<BoardViewer[]>([]);
  /** Đang nối được tới server realtime không — có chỗ hiện "mất kết nối". */
  readonly connected = signal(false);
  /** Board vừa bị người khác xoá — trang Board đọc để rời đi thay vì ngồi lỗi 404. */
  readonly boardDeleted = signal<string | null>(null);

  /** Lời mời vừa nhận qua WebSocket — Header đọc để bật toast "có lời mời mới". */
  readonly newInvite = signal<OrgInvite | null>(null);

  private socket: Socket | null = null;
  /** Đếm số nơi đang cần board này. Chỉ rời phòng khi về 0 — trang Board và khung
   *  chat Dashboard có thể cùng mở một board, nơi này đóng không được kéo nơi kia. */
  private readonly joinCount = new Map<string, number>();

  /**
   * Mở kết nối (một lần cho cả ứng dụng).
   *
   * `auth` truyền HÀM chứ không phải chuỗi: socket.io gọi lại nó ở MỖI lần kết
   * nối, kể cả lần tự kết nối lại. Truyền chuỗi thì token cũ bị dùng lại, mà
   * Firebase ID token chỉ sống 1 giờ — để lâu là mọi lần nối lại đều bị server
   * ngắt vì token hết hạn.
   */
  private ensureSocket(): Socket {
    if (this.socket) return this.socket;

    const socket = io(environment.apiUrl, {
      transports: ['websocket'],
      auth: (cb: (data: { token: string }) => void) => {
        void this.firebase.getIdToken().then((token) => cb({ token: token ?? '' }));
      },
    });

    socket.on('connect', () => {
      this.connected.set(true);
      // Kết nối lại (mạng chớp, laptop mở nắp) là mất sạch phòng đã vào — phải
      // xin vào lại, nếu không giao diện im lặng ngừng cập nhật mà không báo gì.
      for (const boardId of this.joinCount.keys()) socket.emit(WS.JOIN, { boardId });
    });
    socket.on('disconnect', () => {
      this.connected.set(false);
      this.viewers.set([]);
    });

    socket.on(WS.EVENT, (event: BoardEvent) => this.apply(event));
    socket.on(WS.USER_EVENT, (event: UserEvent) => this.applyUserEvent(event));
    socket.on(WS.PRESENCE, (p: PresenceEvent) => this.viewers.set(p.viewers ?? []));

    this.socket = socket;
    return socket;
  }

  /**
   * Mở kết nối NGAY khi đăng nhập, không chờ tới lúc mở board.
   *
   * ⚠️ Cần thiết cho chuông lời mời: người được mời có thể đang ở Dashboard và
   *    chưa thuộc tổ chức nào — không có board nào để `joinBoard`. Không gọi
   *    hàm này thì lời mời chỉ hiện sau khi họ tình cờ mở một board.
   *
   * Gọi nhiều lần vô hại: `ensureSocket()` chỉ tạo đúng một kết nối.
   */
  ensureConnected(): void {
    this.ensureSocket();
  }

  /** Đăng xuất → đóng kết nối, tránh người sau nhận thông báo của người trước. */
  disconnect(): void {
    if (!this.socket) return;
    this.socket.close();
    this.socket = null;
    this.joinCount.clear();
    this.connected.set(false);
    this.viewers.set([]);
    this.newInvite.set(null);
  }

  /**
   * Vào phòng của 1 board. Trả về hàm dọn dẹp — component BẮT BUỘC gọi khi rời
   * trang, không thì vẫn nhận sự kiện của board cũ mãi mãi.
   */
  joinBoard(boardId: string): () => void {
    if (!boardId) return () => undefined;

    const socket = this.ensureSocket();
    const count = (this.joinCount.get(boardId) ?? 0) + 1;
    this.joinCount.set(boardId, count);
    if (count === 1 && socket.connected) socket.emit(WS.JOIN, { boardId });

    let done = false;
    return () => {
      if (done) return; // gọi cleanup hai lần không được trừ hai lần
      done = true;
      const left = (this.joinCount.get(boardId) ?? 1) - 1;
      if (left > 0) {
        this.joinCount.set(boardId, left);
        return;
      }
      this.joinCount.delete(boardId);
      this.viewers.set([]);
      if (socket.connected) socket.emit(WS.LEAVE, { boardId });
    };
  }

  /**
   * Việc riêng của chính người dùng này — không phụ thuộc họ đang mở board nào.
   *
   * Socket tự vào phòng `user:<uid>` ngay sau khi xác thực (xem gateway ở
   * backend), nên không cần đăng ký gì thêm: chuông lời mời sáng lên kể cả khi
   * người ta đang ngồi ở Dashboard và chưa thuộc tổ chức nào.
   */
  private applyUserEvent(event: UserEvent): void {
    switch (event.type) {
      case 'invite.created': {
        const r = event.data as {
          id: string;
          orgId: string;
          orgName: string;
          role: OrgInviteRole;
          fromUser: { displayName: string | null; email: string };
          createdAt: string;
        };
        const invite: OrgInvite = {
          id: r.id,
          orgId: r.orgId,
          orgName: r.orgName,
          toUserId: '',
          fromUserId: event.actorId,
          fromUserName: r.fromUser?.displayName || r.fromUser?.email || 'Someone',
          role: r.role ?? 'member',
          status: 'pending',
          createdAt: r.createdAt,
        };
        this.organizations.applyRemoteInvite(invite);
        this.newInvite.set(invite);
        break;
      }

      case 'invite.responded':
        // Người ta đã trả lời ở nơi khác → gỡ khỏi chuông và nạp lại danh sách
        // thành viên (người gửi lời mời cần thấy họ xuất hiện trong tổ chức).
        this.organizations.removeInviteLocally((event.data as { id: string }).id);
        void this.organizations.refreshAfterMembershipChange();
        break;

      case 'member.removed':
        void this.organizations.refreshAfterMembershipChange();
        break;

      case 'card.assigned':
        this.notifications.addCardAssigned(event.data as CardAssignedPayload);
        break;
    }
  }

  /**
   * Định tuyến 1 sự kiện về đúng service.
   *
   * Không lọc bỏ sự kiện do chính mình gây ra: cùng một người có thể mở board ở
   * tab thứ hai, tab đó cũng cần cập nhật. Mọi hàm `applyRemote*` đều theo kiểu
   * "có id rồi thì ghi đè" nên nhận lại thay đổi của mình cũng không nhân đôi.
   */
  private apply(event: BoardEvent): void {
    switch (event.type) {
      case 'list.created':
      case 'list.updated':
        this.lists.applyRemoteList(event.data as ApiList);
        break;
      case 'list.deleted': {
        const { id } = event.data as { id: string };
        this.lists.applyRemoteListDeleted(id);
        this.cards.clearListCards(id); // thẻ bên trong đã bị CASCADE xoá dưới database
        break;
      }

      case 'card.created':
      case 'card.updated':
      case 'card.moved':
        this.cards.applyRemoteCard(event.data as ApiCard);
        break;
      case 'card.deleted': {
        const { id } = event.data as { id: string };
        this.cards.applyRemoteCardDeleted(id);
        this.comments.clearCard(id);
        this.checklist.clearCard(id);
        this.attachments.clearCard(id);
        break;
      }

      case 'label.created':
        this.labels.applyRemoteLabel(event.data as ApiLabel);
        break;
      case 'label.attached': {
        const { cardId, labelId } = event.data as { cardId: string; labelId: string };
        this.labels.applyRemoteAttach(cardId, labelId);
        break;
      }
      case 'label.detached': {
        const { cardId, labelId } = event.data as { cardId: string; labelId: string };
        this.labels.applyRemoteDetach(cardId, labelId);
        break;
      }

      case 'comment.created': {
        const r = event.data as ApiComment & { cardId: string };
        this.comments.applyRemoteComment({
          id: r.id,
          cardId: r.cardId,
          userId: r.userId,
          content: r.content,
          createdAt: r.createdAt,
        } as Comment);
        break;
      }
      case 'comment.deleted': {
        const { id, cardId } = event.data as { id: string; cardId: string };
        this.comments.applyRemoteCommentDeleted(cardId, id);
        break;
      }

      case 'chat.message': {
        const r = event.data as ApiCreatedMessage;
        this.chat.applyIncoming({
          id: r.id,
          orgId: r.orgId,
          boardId: r.boardId,
          userId: r.userId,
          content: r.content,
          createdAt: r.createdAt,
        });
        break;
      }

      case 'activity.created':
        this.activity.applyRemoteLog(event.data as ActivityLog);
        break;

      case 'board.updated':
        this.boards.applyRemoteBoard(event.data as ApiBoard);
        break;
      case 'board.deleted':
        this.boardDeleted.set((event.data as { id: string }).id);
        break;

      case 'checklist.changed':
        this.checklist.applyRemoteItem((event.data as { item: ApiChecklistItem }).item);
        break;
      case 'checklist.deleted': {
        const { cardId, id } = event.data as { cardId: string; id: string };
        this.checklist.applyRemoteDeleted(cardId, id);
        break;
      }

      case 'attachment.changed':
        this.attachments.applyRemote((event.data as { attachment: ApiAttachment }).attachment);
        break;
      case 'attachment.deleted': {
        const { cardId, id } = event.data as { cardId: string; id: string };
        this.attachments.applyRemoteDeleted(cardId, id);
        break;
      }

      case 'suggestion.created':
        this.taskSuggestions.applyRemoteCreated(event.data as ChatTaskSuggestion);
        break;
      case 'suggestion.resolved':
        // Ai đó vừa chấp nhận/bỏ qua ở máy khác → gỡ chip ở đây luôn, kể cả khi
        // người này đang mở modal của đúng gợi ý đó.
        this.taskSuggestions.applyRemoteResolved((event.data as { id: string }).id);
        break;
    }
  }
}
