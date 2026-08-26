import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GoogleMeetService } from './google-meet.service';
import { FirebaseService } from './firebase.service';

// Firebase auth bị mock hoàn toàn: mở popup thật trong test là không thể, và
// bài test này quan tâm tới phần LOGIC quanh nó — chọn đúng hàm popup, dựng
// đúng request Calendar, đọc đúng link ra khỏi phản hồi.
const popup = {
  link: vi.fn(),
  reauth: vi.fn(),
  unlink: vi.fn(),
  tokenTuKetQua: vi.fn(),
};

// ⚠️ Mock TỪNG PHẦN, không thay cả module.
//
// Angular gộp mọi spec vào chung một bundle test, nên `vi.mock` ở đây có hiệu
// lực với CẢ những spec khác. Thay trọn `firebase/auth` là `FirebaseService`
// mất `getAuth` và `app.spec.ts` đổ với lỗi khó lần ra
// ("No getAuth export is defined on the firebase/auth mock").
//
// `importOriginal` giữ nguyên mọi export thật, ta chỉ đè đúng bốn thứ cần.
vi.mock('firebase/auth', async (importOriginal) => {
  const that = await importOriginal<typeof import('firebase/auth')>();
  return {
    ...that,
    GoogleAuthProvider: class {
      scopes: string[] = [];
      params: Record<string, string> = {};
      addScope(s: string) {
        this.scopes.push(s);
      }
      setCustomParameters(p: Record<string, string>) {
        this.params = p;
      }
      static credentialFromResult = (r: unknown) => popup.tokenTuKetQua(r);
    },
    linkWithPopup: (...a: unknown[]) => popup.link(...a),
    reauthenticateWithPopup: (...a: unknown[]) => popup.reauth(...a),
    unlink: (...a: unknown[]) => popup.unlink(...a),
  };
});

const EMAIL = 'thanh@sinhvien.hoasen.edu.vn';

/** `providerData` quyết định service coi tài khoản đã nối Google hay chưa. */
function dungUser(daNoi: boolean, emailGoogle = EMAIL) {
  return {
    email: EMAIL,
    providerData: daNoi
      ? [{ providerId: 'password', email: EMAIL }, { providerId: 'google.com', email: emailGoogle }]
      : [{ providerId: 'password', email: EMAIL }],
  };
}

describe('GoogleMeetService', () => {
  let svc: GoogleMeetService;
  let currentUser: unknown;
  let fetchGia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = dungUser(false);
    popup.tokenTuKetQua.mockReturnValue({ accessToken: 'token-gia' });
    // `linkWithPopup` trả về user SAU khi nối — service đọc `providerData` từ
    // đó để đối chiếu email, nên mock phải mang hình dạng thật.
    popup.link.mockImplementation(async () => ({ user: dungUser(true) }));
    popup.reauth.mockResolvedValue({ user: dungUser(true) });
    popup.unlink.mockResolvedValue(undefined);

    fetchGia = vi.fn();
    vi.stubGlobal('fetch', fetchGia);

    TestBed.configureTestingModule({
      providers: [
        GoogleMeetService,
        { provide: FirebaseService, useValue: { get auth() { return { currentUser }; } } },
      ],
    });
    svc = TestBed.inject(GoogleMeetService);
  });

  afterEach(() => vi.unstubAllGlobals());

  function traLoiGoogle(body: unknown, ok = true, status = 200) {
    fetchGia.mockResolvedValue({ ok, status, json: async () => body });
  }

  it('đọc được trạng thái đã nối Google từ providerData', () => {
    expect(svc.daNoiGoogle()).toBe(false);
    currentUser = dungUser(true);
    expect(svc.daNoiGoogle()).toBe(true);
  });

  it('chưa nối thì dùng linkWithPopup; đã nối thì dùng reauthenticateWithPopup', async () => {
    traLoiGoogle({ hangoutLink: 'https://meet.google.com/aaa-bbbb-ccc' });

    await svc.taoPhongHop('Board X');
    expect(popup.link).toHaveBeenCalledTimes(1);
    expect(popup.reauth).not.toHaveBeenCalled();

    // Đã nối rồi mà vẫn gọi `linkWithPopup` là Firebase ném
    // `provider-already-linked` — phải đổi sang `reauthenticateWithPopup`.
    vi.clearAllMocks();
    popup.tokenTuKetQua.mockReturnValue({ accessToken: 'token-gia' });
    popup.reauth.mockResolvedValue({});
    currentUser = dungUser(true);

    await svc.taoPhongHop('Board X');
    expect(popup.reauth).toHaveBeenCalledTimes(1);
    expect(popup.link).not.toHaveBeenCalled();
  });

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
    expect((init as { headers: Record<string, string> }).headers['Authorization']).toBe('Bearer token-gia');
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
    const kq = await svc.taoPhongHop('B');
    expect(kq.meetUrl).toBe('https://meet.google.com/xyz-wxyz-abc');
  });

  it('Google tạo sự kiện nhưng KHÔNG kèm link → báo lỗi, không trả về undefined', async () => {
    traLoiGoogle({ id: 'evt-1' });
    const kq = await svc.taoPhongHop('C');
    expect(kq.meetUrl).toBeUndefined();
    expect(kq.error).toBeTruthy();
  });

  it('403 → nói rõ phải kiểm tra Calendar API và test users', async () => {
    traLoiGoogle({}, false, 403);
    const kq = await svc.taoPhongHop('D');
    expect(kq.error).toContain('test users');
  });

  it('người dùng tự đóng popup thì KHÔNG coi là lỗi', async () => {
    popup.link.mockRejectedValue({ code: 'auth/popup-closed-by-user' });
    expect(await svc.noiGoogle()).toBeNull();
  });

  it('email Google đã thuộc tài khoản khác → nói đúng nguyên nhân', async () => {
    popup.link.mockRejectedValue({ code: 'auth/credential-already-in-use' });
    const loi = await svc.noiGoogle();
    expect(loi).toContain('already linked to a different user');
  });

  it('đã nối rồi thì noiGoogle() không mở popup nữa', async () => {
    currentUser = dungUser(true);
    expect(await svc.noiGoogle()).toBeNull();
    expect(popup.link).not.toHaveBeenCalled();
  });

  it('nối đúng email đăng nhập thì chấp nhận', async () => {
    expect(await svc.noiGoogle()).toBeNull();
    expect(popup.unlink).not.toHaveBeenCalled();
  });

  it('nối NHẦM tài khoản Google khác thì GỠ ra và báo lỗi', async () => {
    // Người dùng vẫn chọn được tài khoản khác trong popup dù đã có login_hint.
    // Nối nhầm là cuộc họp rơi vào lịch của một tài khoản không phải họ.
    popup.link.mockImplementation(async () => ({ user: dungUser(true, 'nguoi.khac@gmail.com') }));

    const loi = await svc.noiGoogle();
    expect(popup.unlink).toHaveBeenCalledTimes(1);
    expect(loi).toContain('nguoi.khac@gmail.com');
    expect(loi).toContain(EMAIL);
  });

  it('gợi ý sẵn đúng email bằng login_hint', async () => {
    await svc.noiGoogle();
    const provider = popup.link.mock.calls[0][1] as { params?: Record<string, string> };
    expect(provider.params?.['login_hint']).toBe(EMAIL);
  });

  it('KHÔNG gửi login_hint chung với prompt=select_account', async () => {
    // Hai tham số này mâu thuẫn: `login_hint` giấu bảng chọn tài khoản,
    // `select_account` buộc hiện nó. Gửi cả hai thì Google trả về trang
    // `accounts.google.com/info/unknownerror` — lỗi trắng, rất khó lần ra.
    await svc.noiGoogle();
    const p = (popup.link.mock.calls[0][1] as { params: Record<string, string> }).params;
    expect(p['login_hint']).toBe(EMAIL);
    expect(p['prompt']).toBeUndefined();
  });

  it('không biết email thì mới dùng select_account', async () => {
    currentUser = { email: null, providerData: [] };
    await svc.noiGoogle();
    const p = (popup.link.mock.calls[0][1] as { params: Record<string, string> }).params;
    expect(p['prompt']).toBe('select_account');
    expect(p['login_hint']).toBeUndefined();
  });

  it('popup hỏng vì login_hint thì thử lại KHÔNG kèm tham số', async () => {
    // Chính sách Workspace của trường hay một quirk phía Google không được phép
    // chặn cả tính năng — hàng rào thật là phép đối chiếu email phía sau.
    popup.link
      .mockRejectedValueOnce({ code: 'auth/internal-error' })
      .mockImplementationOnce(async () => ({ user: dungUser(true) }));

    expect(await svc.noiGoogle()).toBeNull();
    expect(popup.link).toHaveBeenCalledTimes(2);
    const lan2 = (popup.link.mock.calls[1][1] as { params: Record<string, string> }).params;
    expect(lan2['login_hint']).toBeUndefined();
  });

  it('người dùng tự đóng popup thì KHÔNG thử lại', async () => {
    popup.link.mockRejectedValue({ code: 'auth/popup-closed-by-user' });
    await svc.noiGoogle();
    expect(popup.link).toHaveBeenCalledTimes(1);
  });

  it('gỡ liên kết gọi unlink với đúng providerId', async () => {
    currentUser = dungUser(true);
    expect(await svc.goLienKet()).toBeNull();
    expect(popup.unlink).toHaveBeenCalledWith(currentUser, 'google.com');
  });

  it('xin đúng scope hẹp calendar.events, KHÔNG xin cả quyền lịch', async () => {
    traLoiGoogle({ hangoutLink: 'https://meet.google.com/aaa-bbbb-ccc' });
    await svc.taoPhongHop('E');
    const provider = popup.link.mock.calls[0][1] as { scopes: string[] };
    expect(provider.scopes).toEqual(['https://www.googleapis.com/auth/calendar.events']);
  });
});
