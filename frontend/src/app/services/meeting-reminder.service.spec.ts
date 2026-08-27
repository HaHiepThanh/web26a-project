import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MeetingReminderService } from './meeting-reminder.service';
import { MeetingsService } from './meetings.service';
import { NotificationService } from './notification.service';
import { RealtimeService } from './realtime.service';
import { AuthService } from './auth.service';
import { UpcomingMeeting } from '../models';

function cuocHop(over: Partial<UpcomingMeeting> = {}): UpcomingMeeting {
  return {
    id: 'm1',
    boardId: 'b1',
    boardName: 'Board A',
    orgSlug: 'org-a',
    title: 'Họp tuần',
    startAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    remindMinutes: 10,
    meetUrl: null,
    ...over,
  };
}

describe('MeetingReminderService', () => {
  let svc: MeetingReminderService;
  let sapToi: ReturnType<typeof vi.fn<() => Promise<UpcomingMeeting[]>>>;
  let nhac: ReturnType<typeof vi.fn>;
  let dangNhap: ReturnType<typeof signal<boolean>>;
  let handlers: Map<string, () => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    sapToi = vi.fn<() => Promise<UpcomingMeeting[]>>().mockResolvedValue([]);
    nhac = vi.fn();
    dangNhap = signal(false);
    handlers = new Map();

    TestBed.configureTestingModule({
      providers: [
        MeetingReminderService,
        { provide: MeetingsService, useValue: { sapToiCuaToi: () => sapToi() } },
        { provide: NotificationService, useValue: { addMeetingReminder: nhac } },
        {
          provide: RealtimeService,
          useValue: {
            onUserEvent: (t: string, h: () => void) => {
              handlers.set(t, h);
              return () => handlers.delete(t);
            },
          },
        },
        { provide: AuthService, useValue: { isLoggedIn: dangNhap } },
      ],
    });
    svc = TestBed.inject(MeetingReminderService);
  });

  afterEach(() => vi.useRealTimers());

  /** Bật service bằng cách "đăng nhập" rồi để effect chạy. */
  async function batLen(ds: UpcomingMeeting[]): Promise<void> {
    sapToi.mockResolvedValue(ds);
    dangNhap.set(true);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(0);
  }

  it('chưa đăng nhập thì KHÔNG hỏi server', () => {
    TestBed.tick();
    expect(sapToi).not.toHaveBeenCalled();
  });

  it('đăng nhập thì hỏi ngay, không chờ hết chu kỳ', async () => {
    await batLen([]);
    expect(sapToi).toHaveBeenCalledTimes(1);
  });

  it('chưa tới mốc nhắc thì CHƯA nhắc', async () => {
    await batLen([cuocHop({ startAt: new Date(Date.now() + 60 * 60_000).toISOString() })]);
    expect(nhac).not.toHaveBeenCalled();
  });

  it('đặt hẹn giờ đúng mốc: nhắc trước 10 phút của cuộc sau 30 phút', async () => {
    await batLen([
      cuocHop({ startAt: new Date(Date.now() + 30 * 60_000).toISOString(), remindMinutes: 10 }),
    ]);

    // Còn 21 phút nữa mới tới mốc (30 - 10 = 20 phút).
    await vi.advanceTimersByTimeAsync(19 * 60_000);
    expect(nhac).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(nhac).toHaveBeenCalledTimes(1);
    expect(nhac.mock.calls[0][0]).toMatchObject({ id: 'm1', boardId: 'b1', orgSlug: 'org-a' });
  });

  it('ĐÃ qua mốc nhắc mà chưa họp → nhắc NGAY (người vừa mở máy không bị lỡ)', async () => {
    // Họp sau 3 phút, nhắc trước 10 phút → mốc nhắc đã qua 7 phút.
    await batLen([
      cuocHop({ startAt: new Date(Date.now() + 3 * 60_000).toISOString(), remindMinutes: 10 }),
    ]);
    expect(nhac).toHaveBeenCalledTimes(1);
  });

  it('qua mốc nhắc QUÁ LÂU thì thôi, không nhắc muộn vô nghĩa', async () => {
    // Nhắc trước 10 phút nhưng cuộc họp đã bắt đầu 30 phút trước.
    await batLen([
      cuocHop({ startAt: new Date(Date.now() - 30 * 60_000).toISOString(), remindMinutes: 10 }),
    ]);
    expect(nhac).not.toHaveBeenCalled();
  });

  it('chọn "không nhắc" thì không bao giờ nhắc', async () => {
    await batLen([
      cuocHop({ startAt: new Date(Date.now() + 60_000).toISOString(), remindMinutes: 0 }),
    ]);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(nhac).not.toHaveBeenCalled();
  });

  it('cuộc họp biến mất khỏi danh sách (bị huỷ) → HUỶ hẹn giờ, không nhắc nữa', async () => {
    await batLen([
      cuocHop({ startAt: new Date(Date.now() + 30 * 60_000).toISOString(), remindMinutes: 10 }),
    ]);

    // Nhịp hỏi kế tiếp không còn cuộc đó nữa.
    sapToi.mockResolvedValue([]);
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    // Chạy qua hẳn mốc nhắc cũ.
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    expect(nhac).not.toHaveBeenCalled();
  });

  it('hỏi lại nhiều lần KHÔNG đặt chồng hẹn giờ', async () => {
    const ds = [cuocHop({ startAt: new Date(Date.now() + 30 * 60_000).toISOString() })];
    await batLen(ds);
    await vi.advanceTimersByTimeAsync(5 * 60_000); // nhịp hỏi thứ 2
    await vi.advanceTimersByTimeAsync(5 * 60_000); // nhịp hỏi thứ 3
    await vi.advanceTimersByTimeAsync(20 * 60_000); // qua mốc nhắc
    expect(nhac).toHaveBeenCalledTimes(1);
  });

  it('server hỏng thì im lặng bỏ qua, lần sau vẫn hỏi lại', async () => {
    sapToi.mockRejectedValue(new Error('mất mạng'));
    dangNhap.set(true);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(0);
    expect(nhac).not.toHaveBeenCalled();

    // Đặt giờ họp xa hơn nhịp hỏi: sau khi tua 5 phút thì cuộc họp vẫn còn ở
    // phía trước và mốc nhắc mới qua ~7 phút — tức vẫn trong hạn nhắc muộn.
    sapToi.mockResolvedValue([
      cuocHop({ startAt: new Date(Date.now() + 8 * 60_000).toISOString(), remindMinutes: 10 }),
    ]);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(nhac).toHaveBeenCalledTimes(1);
  });

  it('có người vừa hẹn lịch → nạp lại NGAY, không chờ hết chu kỳ', async () => {
    await batLen([]);
    expect(sapToi).toHaveBeenCalledTimes(1);

    sapToi.mockResolvedValue([
      cuocHop({ startAt: new Date(Date.now() + 2 * 60_000).toISOString(), remindMinutes: 10 }),
    ]);
    handlers.get('meeting.scheduled')?.();
    await vi.advanceTimersByTimeAsync(0);

    expect(sapToi).toHaveBeenCalledTimes(2);
    expect(nhac).toHaveBeenCalledTimes(1);
  });

  it('đăng xuất thì dừng hẳn: không hỏi nữa và hẹn giờ đang chờ bị huỷ', async () => {
    await batLen([
      cuocHop({ startAt: new Date(Date.now() + 30 * 60_000).toISOString(), remindMinutes: 10 }),
    ]);
    const truoc = sapToi.mock.calls.length;

    dangNhap.set(false);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(30 * 60_000);

    expect(sapToi).toHaveBeenCalledTimes(truoc);
    expect(nhac).not.toHaveBeenCalled();
  });

  it('giờ bắt đầu rác không làm nổ cả vòng lặp', async () => {
    await batLen([
      cuocHop({ id: 'xau', startAt: 'không-phải-ngày' }),
      cuocHop({ id: 'tot', startAt: new Date(Date.now() + 3 * 60_000).toISOString() }),
    ]);
    expect(nhac).toHaveBeenCalledTimes(1);
    expect(nhac.mock.calls[0][0].id).toBe('tot');
  });
});
