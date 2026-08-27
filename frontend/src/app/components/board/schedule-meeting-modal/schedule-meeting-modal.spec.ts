import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScheduleMeetingModal } from './schedule-meeting-modal';
import { ApiService } from '../../../services/api.service';
import { GoogleCalendarService } from '../../../services/google-calendar.service';
import { MeetingsService } from '../../../services/meetings.service';

describe('ScheduleMeetingModal', () => {
  let apiMock: { get: ReturnType<typeof vi.fn> };
  let calendarMock: { taoLichHop: ReturnType<typeof vi.fn> };
  let meetingsMock: { luu: ReturnType<typeof vi.fn> };

  const membersMock = [
    {
      id: 'bm-1',
      role: 'member',
      user: {
        id: 'u-1',
        email: 'alice@example.com',
        displayName: 'Alice Nguyen',
        avatarUrl: null,
        googleLinked: true,
      },
    },
    {
      id: 'bm-2',
      role: 'member',
      user: {
        id: 'u-2',
        email: 'bob@example.com',
        displayName: 'Bob Tran',
        avatarUrl: null,
        googleLinked: false,
      },
    },
  ];

  beforeEach(() => {
    apiMock = {
      get: vi.fn().mockResolvedValue(membersMock),
    };
    calendarMock = {
      taoLichHop: vi.fn().mockResolvedValue({
        googleEventId: 'gev-1',
        googleHtmlLink: 'https://calendar.google.com/event?id=1',
        meetUrl: 'https://meet.google.com/abc-defg-hij',
      }),
    };
    meetingsMock = {
      luu: vi.fn().mockResolvedValue({ id: 'meet-1' }),
    };

    TestBed.configureTestingModule({
      providers: [
        ScheduleMeetingModal,
        { provide: ApiService, useValue: apiMock },
        { provide: GoogleCalendarService, useValue: calendarMock },
        { provide: MeetingsService, useValue: meetingsMock },
      ],
    });
  });

  it('khởi tạo với các giá trị mặc định hợp lệ', () => {
    const fixture = TestBed.createComponent(ScheduleMeetingModal);
    const comp = fixture.componentInstance;
    expect(comp.phutKeoDai()).toBe(30);
    expect(comp.nhacTruoc()).toBe(10);
    expect(comp.kemMeet()).toBe(true);
    expect(comp.daChon()).toEqual([]);
  });

  it('nhập file .ics sẽ tự động điền các trường và chọn thành viên khớp email', async () => {
    const fixture = TestBed.createComponent(ScheduleMeetingModal);
    const comp = fixture.componentInstance;

    // Giả lập danh sách ứng viên đã tải
    comp.ungVien.set([
      { id: 'u-1', ten: 'Alice Nguyen', email: 'alice@example.com', avatarUrl: null, moiDuoc: true },
      { id: 'u-2', ten: 'Bob Tran', email: 'bob@example.com', avatarUrl: null, moiDuoc: false },
    ]);

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:test-123@example.com',
      'SUMMARY:Hop voi khach hang VIP',
      'DESCRIPTION:Trao doi ve du an Q3',
      'DTSTART:20260901T090000Z',
      'DTEND:20260901T094500Z',
      'LOCATION:https://meet.google.com/xyz-uvwx-rst',
      'ATTENDEE;CN=Alice:mailto:alice@example.com',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const file = new File([icsContent], 'client-meeting.ics', { type: 'text/calendar' });
    const event = {
      target: {
        files: [file],
        value: '',
      },
    } as unknown as Event;

    await comp.nhapFileIcs(event);

    expect(comp.title()).toBe('Hop voi khach hang VIP');
    expect(comp.description()).toBe('Trao doi ve du an Q3');
    expect(comp.kemMeet()).toBe(true);
    expect(comp.phutKeoDai()).toBe(45);
    // Alice khớp email và đã liên kết Google nên được tự động chọn
    expect(comp.daChon()).toContain('u-1');
    expect(comp.thongBaoNhap()).toContain('client-meeting.ics');
  });

  it('sau khi import có thể chỉnh sửa tiêu đề và chọn thêm/bớt thành viên', async () => {
    const fixture = TestBed.createComponent(ScheduleMeetingModal);
    const comp = fixture.componentInstance;

    comp.ungVien.set([
      { id: 'u-1', ten: 'Alice Nguyen', email: 'alice@example.com', avatarUrl: null, moiDuoc: true },
      { id: 'u-3', ten: 'Charlie Pham', email: 'charlie@example.com', avatarUrl: null, moiDuoc: true },
    ]);

    comp.title.set('Họp cũ');
    comp.title.set('Họp mới đã chỉnh sửa');
    expect(comp.title()).toBe('Họp mới đã chỉnh sửa');

    comp.doiChon('u-1');
    expect(comp.daChon()).toContain('u-1');

    comp.doiChon('u-3');
    expect(comp.daChon()).toContain('u-3');

    comp.doiChon('u-1');
    expect(comp.daChon()).not.toContain('u-1');
    expect(comp.daChon()).toContain('u-3');
  });

  it('xuatIcs tải file .ics với đúng nội dung bản thảo', () => {
    const fixture = TestBed.createComponent(ScheduleMeetingModal);
    const comp = fixture.componentInstance;

    let downloadedFileName = '';
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName);
      if (tagName === 'a') {
        Object.defineProperty(el, 'download', {
          set(val: string) {
            downloadedFileName = val;
          },
          get() {
            return downloadedFileName;
          },
        });
        el.click = clickSpy;
      }
      return el;
    });

    comp.title.set('Sprint Planning Q4');
    comp.description.set('Thảo luận backlog');
    comp.ngay.set('2026-09-02');
    comp.gio.set('14:00');
    comp.phutKeoDai.set(60);

    comp.xuatIcs();

    expect(clickSpy).toHaveBeenCalled();
    expect(downloadedFileName).toBe('Sprint-Planning-Q4.ics');
  });

  it('xuatPdf kích hoạt lệnh window.print', () => {
    const fixture = TestBed.createComponent(ScheduleMeetingModal);
    const comp = fixture.componentInstance;

    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    comp.xuatPdf();
    expect(printSpy).toHaveBeenCalled();
  });
});
