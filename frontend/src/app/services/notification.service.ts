import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AppNotification } from '../models';
import { AuthService } from './auth.service';

/** Giữ tối đa ngần này thông báo — chuông không phải nhật ký, cũ quá thì bỏ. */
const MAX_ITEMS = 30;

/**
 * Giờ hiển thị cho người đọc — theo múi giờ TRÌNH DUYỆT của họ.
 *
 * Không dùng `time_zone` mà người tạo đã chọn: `startAt` là thời điểm tuyệt
 * đối, nên người ở múi giờ khác cần thấy giờ CỦA HỌ, không phải giờ của người
 * đặt lịch.
 */
function gioDoc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function storageKey(uid: string): string {
  return `trello_notifications_${uid}`;
}

/**
 * Thông báo cá nhân ở chuông 🔔 trên Header.
 *
 * Lưu theo TỪNG USER trong localStorage: hai người dùng chung một máy không được
 * thấy thông báo của nhau, và F5 không mất những thông báo chưa đọc.
 *
 * Nguồn duy nhất là WebSocket (`RealtimeService`) — không có endpoint
 * `GET /notifications` ở backend, nên thông báo nhận được lúc offline sẽ không
 * có. Chấp nhận được: đây là nhắc việc tức thời, còn nguồn sự thật vẫn là thẻ
 * trong board.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly auth = inject(AuthService);

  readonly items = signal<AppNotification[]>([]);
  readonly unreadCount = computed(() => this.items().filter((n) => !n.read).length);

  constructor() {
    // Đổi tài khoản → nạp lại đúng hộp thông báo của người đó.
    effect(() => {
      const uid = this.auth.currentUserId();
      this.items.set(uid ? this.load(uid) : []);
    });
  }

  private load(uid: string): AppNotification[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(storageKey(uid));
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? (parsed as AppNotification[]) : [];
    } catch {
      return [];
    }
  }

  private persist(list: AppNotification[]): void {
    const uid = this.auth.currentUserId();
    if (!uid || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(storageKey(uid), JSON.stringify(list));
    } catch {
      /* hết quota thì thôi, chỉ mất lịch sử thông báo */
    }
  }

  /** Thêm 1 thông báo. Chống trùng theo id: mở nhiều tab thì tab nào cũng nhận. */
  add(notification: AppNotification): void {
    this.items.update((all) => {
      if (all.some((n) => n.id === notification.id)) return all;
      const next = [notification, ...all].slice(0, MAX_ITEMS);
      this.persist(next);
      return next;
    });
  }

  /** Được giao phụ trách 1 thẻ. */
  /**
   * Có người mở cuộc họp trên board mình tham gia.
   *
   * `id` kèm thời điểm: mở rồi đóng rồi mở lại là hai lời mời khác nhau, người
   * dùng cần thấy cả hai. Nhưng cùng MỘT sự kiện tới ở hai tab thì `add()`
   * chống trùng theo id nên vẫn chỉ tính một.
   */
  addMeetingStarted(p: {
    boardId: string;
    boardName: string;
    orgSlug: string;
    byUserName: string;
  }): void {
    this.add({
      id: `meeting-${p.boardId}-${Date.now()}`,
      type: 'meeting.started',
      text: `${p.byUserName} started a meeting on "${p.boardName}"`,
      orgSlug: p.orgSlug,
      boardId: p.boardId,
      cardId: '',
      createdAt: new Date().toISOString(),
      read: false,
    });
  }

  /** Có người @nhắc tên mình trong chat của một board. */
  addChatMention(p: {
    boardId: string;
    boardName: string;
    orgSlug: string;
    byUserName: string;
    excerpt?: string;
  }): void {
    const trich = p.excerpt ? `: "${p.excerpt}"` : '';
    this.add({
      id: `mention-${p.boardId}-${Date.now()}`,
      type: 'chat.mention',
      text: `${p.byUserName} mentioned you in "${p.boardName}"${trich}`,
      orgSlug: p.orgSlug,
      boardId: p.boardId,
      cardId: '',
      createdAt: new Date().toISOString(),
      read: false,
    });
  }

  addCardAssigned(p: {
    cardId: string;
    cardTitle: string;
    boardId: string;
    boardName: string;
    workspaceName: string;
    orgSlug: string;
  }): void {
    const noiDung = p.workspaceName
      ? `You were assigned to the card "${p.cardTitle}" in workspace ${p.workspaceName}`
      : `You were assigned to the card "${p.cardTitle}"`;

    this.add({
      // id gắn với THẺ + thời điểm: gán đi gán lại cùng một thẻ vẫn là hai lần
      // nhắc khác nhau, nhưng cùng một sự kiện tới ở hai tab thì chỉ tính một.
      id: `assigned-${p.cardId}-${Date.now()}`,
      type: 'card.assigned',
      text: noiDung,
      orgSlug: p.orgSlug,
      boardId: p.boardId,
      cardId: p.cardId,
      createdAt: new Date().toISOString(),
      read: false,
    });
  }

  /**
   * Một thẻ được giao cho tôi đã quá hạn.
   *
   * `id` cố ý KHÔNG kèm thời điểm (khác `addCardAssigned`): mỗi lần mở app lại
   * hỏi `GET /cards/my-due` và thẻ vẫn quá hạn thì vẫn trả về, nên id có
   * `Date.now()` sẽ đẻ ra một thông báo mới mỗi lần mở — chuông ngập cùng một
   * thẻ. Khoá theo thẻ + hạn thì một thẻ chỉ nhắc ĐÚNG MỘT lần; dời hạn sang
   * ngày khác rồi lại trễ mới tính là lần nhắc mới.
   */
  addCardOverdue(p: {
    cardId: string;
    title: string;
    dueDate: string;
    daysOverdue: number;
    boardId: string;
    boardName: string;
    workspaceName: string;
    orgSlug: string;
  }): void {
    const soNgay = `${p.daysOverdue} day${p.daysOverdue > 1 ? 's' : ''} overdue`;
    const noiChon = p.workspaceName
      ? `board "${p.boardName}" · workspace "${p.workspaceName}"`
      : `board "${p.boardName}"`;

    this.add({
      id: `overdue-${p.cardId}-${p.dueDate}`,
      type: 'card.overdue',
      text: `"${p.title}" is ${soNgay} — ${noiChon}`,
      orgSlug: p.orgSlug,
      boardId: p.boardId,
      cardId: p.cardId,
      createdAt: new Date().toISOString(),
      read: false,
    });
  }

  /**
   * Có người hẹn một cuộc họp và mời mình.
   *
   * Giờ hiển thị theo múi giờ TRÌNH DUYỆT người xem, không theo múi giờ người
   * tạo: `startAt` là thời điểm tuyệt đối, nên hai người ở hai nơi đều đọc ra
   * đúng giờ của mình.
   */
  addMeetingScheduled(p: {
    meetingId: string;
    boardId: string;
    boardName: string;
    orgSlug: string;
    title: string;
    startAt: string;
    byUserName: string;
  }): void {
    this.add({
      id: `meeting-scheduled-${p.meetingId}`,
      type: 'meeting.scheduled',
      text: `${p.byUserName} invited you to "${p.title}" on ${gioDoc(p.startAt)} — board "${p.boardName}"`,
      orgSlug: p.orgSlug,
      boardId: p.boardId,
      cardId: '',
      createdAt: new Date().toISOString(),
      read: false,
    });
  }



  markRead(id: string): void {
    this.items.update((all) => {
      const next = all.map((n) => (n.id === id ? { ...n, read: true } : n));
      this.persist(next);
      return next;
    });
  }

  markAllRead(): void {
    this.items.update((all) => {
      const next = all.map((n) => ({ ...n, read: true }));
      this.persist(next);
      return next;
    });
  }

  clear(): void {
    this.items.set([]);
    this.persist([]);
  }
}
