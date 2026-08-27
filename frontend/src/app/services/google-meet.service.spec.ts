import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GoogleMeetService } from './google-meet.service';
import { GoogleOauthService } from './google-oauth.service';

/**
 * Phần liên kết tài khoản / mở popup / xin token đã chuyển sang
 * `GoogleOauthService` và được kiểm ở `google-oauth.service.spec.ts`. Ở đây chỉ
 * còn đúng việc của Meet: dựng request Calendar cho tử tế và đọc link ra khỏi
 * phản hồi. Nhờ vậy không phải mock `firebase/auth` nữa — chỉ mock một service.
 */
describe('GoogleMeetService', () => {
  let svc: GoogleMeetService;
  let fetchGia: ReturnType<typeof vi.fn>;
  let layToken: ReturnType<typeof vi.fn<() => Promise<{ token?: string; error?: string }>>>;

  beforeEach(() => {
    vi.clearAllMocks();
    layToken = vi.fn<() => Promise<{ token?: string; error?: string }>>().mockResolvedValue({
      token: 'token-gia',
    });
    fetchGia = vi.fn();
    vi.stubGlobal('fetch', fetchGia);

    TestBed.configureTestingModule({
      providers: [
        GoogleMeetService,
        {
          provide: GoogleOauthService,
          useValue: {
            layToken: () => layToken(),
            doiLoiGoogle: (s: number) =>
              s === 403
                ? 'Google denied calendar access. Check that the Calendar API is enabled and this account is in the OAuth test users list.'
                : `Google returned error ${s}. Please try again.`,
          },
        },
      ],
    });
    svc = TestBed.inject(GoogleMeetService);
  });

  afterEach(() => vi.unstubAllGlobals());

  function traLoiGoogle(body: unknown, ok = true, status = 200) {
    fetchGia.mockResolvedValue({ ok, status, json: async () => body });
  }

  it('gửi conferenceDataVersion=1 và summary = tên board', async () => {
    traLoiGoogle({ hangoutLink: 'https://meet.google.com/aaa-bbbb-ccc' });
    await svc.taoPhongHop('Kế hoạch Q3');

    const [url, init] = fetchGia.mock.calls[0];
    // Thiếu tham số này thì Google lặng lẽ bỏ qua conferenceData: sự kiện vẫn
    // tạo được nhưng KHÔNG có link Meet nào.
    expect(url).toContain('conferenceDataVersion=1');

    const body = JSON.parse((init as { body: string }).body);
    expect(body.summary).toBe('Kế hoạch Q3');
    expect(body.conferenceData.createRequest.conferenceSolutionKey.type).toBe('hangoutsMeet');
    expect((init as { headers: Record<string, string> }).headers['Authorization']).toBe(
      'Bearer token-gia',
    );
  });

  it('mỗi lần tạo dùng requestId KHÁC nhau', async () => {
    traLoiGoogle({ hangoutLink: 'https://meet.google.com/aaa-bbbb-ccc' });
    await svc.taoPhongHop('A');
    await svc.taoPhongHop('A');

    const id1 = JSON.parse(fetchGia.mock.calls[0][1].body).conferenceData.createRequest.requestId;
    const id2 = JSON.parse(fetchGia.mock.calls[1][1].body).conferenceData.createRequest.requestId;
    // Trùng requestId là Google trả lại đúng phòng cũ thay vì tạo phòng mới.
    expect(id1).not.toBe(id2);
  });

  it('không có hangoutLink thì lấy từ entryPoints', async () => {
    traLoiGoogle({
      conferenceData: {
        entryPoints: [
          { entryPointType: 'phone', uri: 'tel:+1234' },
          { entryPointType: 'video', uri: 'https://meet.google.com/xyz-wxyz-abc' },
        ],
      },
    });
    expect((await svc.taoPhongHop('B')).meetUrl).toBe('https://meet.google.com/xyz-wxyz-abc');
  });

  it('Google tạo sự kiện nhưng KHÔNG kèm link → báo lỗi, không trả về undefined', async () => {
    traLoiGoogle({ id: 'evt-1' });
    const kq = await svc.taoPhongHop('C');
    expect(kq.meetUrl).toBeUndefined();
    expect(kq.error).toBeTruthy();
  });

  it('403 → nói rõ phải kiểm tra Calendar API và test users', async () => {
    traLoiGoogle({}, false, 403);
    expect((await svc.taoPhongHop('D')).error).toContain('test users');
  });

  it('không xin được token thì KHÔNG gọi Google', async () => {
    layToken.mockResolvedValue({ error: 'Người dùng đóng popup' });
    const kq = await svc.taoPhongHop('E');
    expect(fetchGia).not.toHaveBeenCalled();
    expect(kq.error).toBe('Người dùng đóng popup');
  });
});
