import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { NotificationService } from './notification.service';
import { AuthService } from './auth.service';
import { User } from '../models';

const ME: User = { id: 'u-toi', email: 'toi@test.dev', displayName: 'Tôi' };

const QUA_HAN = {
  cardId: 'c1',
  title: 'Viết API đăng nhập',
  dueDate: '2026-08-20',
  daysOverdue: 6,
  boardId: 'b1',
  boardName: 'Board Seed',
  workspaceName: 'Workspace Seed',
  orgSlug: 'seed-hocvien-b',
};

describe('NotificationService — nhắc thẻ quá hạn', () => {
  let service: NotificationService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    TestBed.inject(AuthService).currentUser.set(ME);
    service = TestBed.inject(NotificationService);
    service.clear();
  });

  it('câu thông báo nói rõ thẻ nằm ở board nào, workspace nào', () => {
    service.addCardOverdue(QUA_HAN);

    const n = service.items()[0];
    expect(n.text).toContain('Viết API đăng nhập');
    expect(n.text).toContain('6 days overdue');
    expect(n.text).toContain('Board Seed');
    expect(n.text).toContain('Workspace Seed');
  });

  it('mang đủ orgSlug + boardId để bấm vào là tới đúng board', () => {
    service.addCardOverdue(QUA_HAN);

    const n = service.items()[0];
    // Header dựng route `/:orgSlug/board/:boardId` từ đúng hai trường này.
    expect(n.orgSlug).toBe('seed-hocvien-b');
    expect(n.boardId).toBe('b1');
    expect(n.cardId).toBe('c1');
    expect(n.type).toBe('card.overdue');
  });

  it('hỏi lại nhiều lần cũng chỉ nhắc MỘT lần cho cùng một thẻ', () => {
    // `GET /cards/my-due` trả lại thẻ đó ở mọi lần kiểm tra khi nó còn quá hạn —
    // không chống trùng thì mở app 10 lần là chuông có 10 dòng y hệt.
    service.addCardOverdue(QUA_HAN);
    service.addCardOverdue(QUA_HAN);
    service.addCardOverdue(QUA_HAN);

    expect(service.items().length).toBe(1);
  });

  it('đã đọc rồi thì lần kiểm tra sau không bật lại thành chưa đọc', () => {
    service.addCardOverdue(QUA_HAN);
    service.markRead(service.items()[0].id);

    service.addCardOverdue(QUA_HAN);

    expect(service.items().length).toBe(1);
    expect(service.items()[0].read).toBe(true);
    expect(service.unreadCount()).toBe(0);
  });

  it('dời hạn rồi lại trễ thì tính là một lần nhắc mới', () => {
    service.addCardOverdue(QUA_HAN);
    service.addCardOverdue({ ...QUA_HAN, dueDate: '2026-08-25', daysOverdue: 1 });

    expect(service.items().length).toBe(2);
  });

  it('thẻ ở board chưa thuộc workspace nào thì bỏ hẳn vế workspace', () => {
    service.addCardOverdue({ ...QUA_HAN, workspaceName: '' });

    expect(service.items()[0].text).toContain('Board Seed');
    expect(service.items()[0].text).not.toContain('workspace');
  });

  it('quá hạn 1 ngày thì viết số ít, không phải "1 days"', () => {
    service.addCardOverdue({ ...QUA_HAN, daysOverdue: 1 });

    expect(service.items()[0].text).toContain('1 day overdue');
  });

  // ---------------------------------------------------------------- lịch họp

  const LICH = {
    meetingId: 'mt-1',
    boardId: 'b-1',
    boardName: 'Board Seed',
    orgSlug: 'org-seed',
    title: 'Sprint review',
    startAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    byUserName: 'An',
  };

  it('lời mời họp nói rõ ai mời, họp gì, ở board nào', () => {
    service.addMeetingScheduled(LICH);

    const n = service.items()[0];
    expect(n.type).toBe('meeting.scheduled');
    expect(n.text).toContain('An');
    expect(n.text).toContain('Sprint review');
    expect(n.text).toContain('Board Seed');
    // Điều hướng chỉ cần orgSlug + boardId, không gắn thẻ nào.
    expect(n.orgSlug).toBe('org-seed');
    expect(n.boardId).toBe('b-1');
    expect(n.cardId).toBe('');
  });

  it('cùng một lời mời tới ở hai tab chỉ tính MỘT thông báo', () => {
    service.addMeetingScheduled(LICH);
    service.addMeetingScheduled(LICH);

    expect(service.items().length).toBe(1);
  });
});
