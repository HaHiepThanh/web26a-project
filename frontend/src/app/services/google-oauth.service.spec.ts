import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { GoogleAuthProvider, User, UserCredential } from 'firebase/auth';
import { GoogleOauthService } from './google-oauth.service';
import { FirebaseService } from './firebase.service';
import { ApiService } from './api.service';

/** Đọc tham số/scope ra khỏi `GoogleAuthProvider` THẬT mà service vừa dựng. */
function thamSo(lanGoi: number): Record<string, string> {
  const p = popup.link.mock.calls[lanGoi][1] as GoogleAuthProvider;
  return p.getCustomParameters() as Record<string, string>;
}

const popup = {
  link: vi.fn(),
  reauth: vi.fn(),
  unlink: vi.fn(),
  token: vi.fn(),
};

/**
 * Thay bốn khe cắm bằng spy — xem ghi chú trong `GoogleOauthService` về việc vì
 * sao KHÔNG dùng `vi.mock('firebase/auth')` ở đây (mock cấp module rò sang các
 * spec khác trong cùng bundle và đã từng làm đổ vài spec không liên quan).
 */
class OauthGia extends GoogleOauthService {
  protected override goiLink(u: User, p: GoogleAuthProvider): Promise<UserCredential> {
    return popup.link(u, p) as Promise<UserCredential>;
  }
  protected override goiReauth(u: User, p: GoogleAuthProvider): Promise<UserCredential> {
    return popup.reauth(u, p) as Promise<UserCredential>;
  }
  protected override goiUnlink(u: User, id: string): Promise<User> {
    return popup.unlink(u, id) as Promise<User>;
  }
  protected override tokenTuKetQua(r: UserCredential): string | undefined {
    return popup.token(r) as string | undefined;
  }
}

const EMAIL = 'thanh@sinhvien.hoasen.edu.vn';

/** `providerData` quyết định service coi tài khoản đã nối Google hay chưa. */
function dungUser(daNoi: boolean, emailGoogle = EMAIL) {
  return {
    email: EMAIL,
    getIdToken: vi.fn().mockResolvedValue('id-token'),
    providerData: daNoi
      ? [{ providerId: 'password', email: EMAIL }, { providerId: 'google.com', email: emailGoogle }]
      : [{ providerId: 'password', email: EMAIL }],
  };
}

describe('GoogleOauthService', () => {
  let svc: GoogleOauthService;
  let currentUser: unknown;
  let apiPost: ReturnType<typeof vi.fn<(p: string, b: unknown) => Promise<unknown>>>;

  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = dungUser(false);
    popup.token.mockReturnValue('token-gia');
    // `goiLink` trả về user SAU khi nối — service đọc `providerData` từ đó để
    // đối chiếu email, nên mock phải mang hình dạng thật.
    popup.link.mockImplementation(async () => ({ user: dungUser(true) }));
    popup.reauth.mockResolvedValue({ user: dungUser(true) });
    popup.unlink.mockResolvedValue(undefined);
    apiPost = vi.fn<(p: string, b: unknown) => Promise<unknown>>().mockResolvedValue({});

    TestBed.configureTestingModule({
      providers: [
        { provide: GoogleOauthService, useClass: OauthGia },
        {
          provide: FirebaseService,
          useValue: {
            get auth() {
              return { currentUser };
            },
          },
        },
        { provide: ApiService, useValue: { post: (p: string, b: unknown) => apiPost(p, b) } },
      ],
    });
    svc = TestBed.inject(GoogleOauthService);
  });

  it('đọc được trạng thái đã nối Google từ providerData', () => {
    expect(svc.daNoiGoogle()).toBe(false);
    currentUser = dungUser(true);
    expect(svc.daNoiGoogle()).toBe(true);
  });

  it('chưa nối thì dùng link; đã nối thì dùng reauthenticate', async () => {
    await svc.layToken();
    expect(popup.link).toHaveBeenCalledTimes(1);
    expect(popup.reauth).not.toHaveBeenCalled();

    // Đã nối rồi mà vẫn gọi `linkWithPopup` là Firebase ném
    // `provider-already-linked` — phải đổi sang `reauthenticateWithPopup`.
    vi.clearAllMocks();
    popup.token.mockReturnValue('token-gia');
    popup.reauth.mockResolvedValue({});
    currentUser = dungUser(true);

    await svc.layToken();
    expect(popup.reauth).toHaveBeenCalledTimes(1);
    expect(popup.link).not.toHaveBeenCalled();
  });

  it('trả về token khi popup thành công', async () => {
    expect(await svc.layToken()).toEqual({ token: 'token-gia' });
  });

  it('Google không cấp token → báo lỗi thay vì trả token rỗng', async () => {
    popup.token.mockReturnValue(undefined);
    const kq = await svc.layToken();
    expect(kq.token).toBeUndefined();
    expect(kq.error).toBeTruthy();
  });

  it('người dùng tự đóng popup thì KHÔNG coi là lỗi', async () => {
    popup.link.mockRejectedValue({ code: 'auth/popup-closed-by-user' });
    expect(await svc.noiGoogle()).toBeNull();
  });

  it('email Google đã thuộc tài khoản khác → nói đúng nguyên nhân', async () => {
    popup.link.mockRejectedValue({ code: 'auth/credential-already-in-use' });
    expect(await svc.noiGoogle()).toContain('already linked to a different user');
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
    expect(thamSo(0)['login_hint']).toBe(EMAIL);
  });

  it('KHÔNG gửi login_hint chung với prompt=select_account', async () => {
    // Hai tham số này mâu thuẫn: `login_hint` giấu bảng chọn tài khoản,
    // `select_account` buộc hiện nó. Gửi cả hai thì Google trả về trang
    // `accounts.google.com/info/unknownerror` — lỗi trắng, rất khó lần ra.
    await svc.noiGoogle();
    const p = thamSo(0);
    expect(p['login_hint']).toBe(EMAIL);
    expect(p['prompt']).toBeUndefined();
  });

  it('không biết email thì mới dùng select_account', async () => {
    currentUser = { email: null, providerData: [], getIdToken: vi.fn() };
    await svc.noiGoogle();
    const p = thamSo(0);
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
    expect(thamSo(1)['login_hint']).toBeUndefined();
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
    await svc.layToken();
    const scopes = (popup.link.mock.calls[0][1] as GoogleAuthProvider).getScopes();
    expect(scopes).toContain('https://www.googleapis.com/auth/calendar.events');
    // Điều đáng giữ là KHÔNG xin quyền rộng: `.../auth/calendar` cho đọc-ghi
    // TOÀN BỘ lịch của người dùng, trong khi ta chỉ cần tạo sự kiện.
    expect(scopes).not.toContain('https://www.googleapis.com/auth/calendar');
    // `profile` do chính GoogleAuthProvider thêm mặc định, không phải ta xin.
    expect(scopes.filter((s) => s.startsWith('https://'))).toHaveLength(1);
  });

  it('nối xong thì ÉP làm mới ID token rồi báo backend', async () => {
    // Không ép làm mới thì token gửi lên vẫn mang claim `firebase.identities`
    // CŨ, và backend kết luận ngược lại điều vừa xảy ra.
    const u = dungUser(false);
    currentUser = u;
    await svc.noiGoogle();
    expect(u.getIdToken).toHaveBeenCalledWith(true);
    expect(apiPost).toHaveBeenCalledWith('/auth/sync', {});
  });

  it('gỡ xong cũng báo backend', async () => {
    const u = dungUser(true);
    currentUser = u;
    await svc.goLienKet();
    expect(apiPost).toHaveBeenCalledWith('/auth/sync', {});
  });

  it('đồng bộ backend hỏng KHÔNG làm hỏng việc liên kết', async () => {
    apiPost.mockRejectedValue(new Error('mất mạng'));
    expect(await svc.noiGoogle()).toBeNull();
  });

  it('dịch lỗi HTTP của Google thành câu người dùng hiểu được', () => {
    expect(svc.doiLoiGoogle(403)).toContain('test users');
    expect(svc.doiLoiGoogle(429)).toContain('rate-limiting');
    expect(svc.doiLoiGoogle(500)).toContain('500');
  });
});
