import { Injectable, inject } from '@angular/core';
import {
  GoogleAuthProvider,
  linkWithPopup,
  reauthenticateWithPopup,
  unlink,
  type UserCredential,
} from 'firebase/auth';
import { FirebaseService } from './firebase.service';

/**
 * Quyền hẹp nhất đủ việc: tạo sự kiện lịch. KHÔNG xin
 * `.../auth/calendar` (đọc-ghi TOÀN BỘ lịch) — ta chỉ cần tạo một sự kiện,
 * xin rộng hơn là bắt người dùng đánh đổi nhiều hơn mức cần thiết, và cũng làm
 * màn hình đồng ý của Google trông đáng ngại hơn.
 */
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

/** Sự kiện tạo ra chỉ để lấy link Meet, nên cho nó ngắn và nằm ngay bây giờ. */
const THOI_LUONG_PHUT = 60;

interface KetQua {
  meetUrl?: string;
  error?: string;
}

/**
 * Tạo phòng Google Meet cho một board.
 *
 * ─── VÌ SAO GỌI GOOGLE TỪ TRÌNH DUYỆT, KHÔNG QUA BACKEND ───
 *
 * Firebase trả về access token của Google sau popup, nhưng KHÔNG kèm refresh
 * token (đã tra tài liệu Firebase). Token sống khoảng một giờ.
 *
 * Muốn backend tự tạo họp thì phải chạy một luồng OAuth riêng để lấy refresh
 * token rồi cất nó — một bí mật dài hạn mở được lịch của người dùng. Cất thứ đó
 * đòi mã hoá khi nghỉ, xoay khoá, đường thu hồi; và một lần rò là rò tài khoản
 * Google THẬT của họ. Đổi lại chỉ để bớt một cú popup.
 *
 * Nên: gọi thẳng từ tab đang mở, token sống trong bộ nhớ vài giây rồi mất.
 * Backend chỉ nhận đúng một chuỗi URL đã tạo xong — nó không bao giờ thấy token.
 *
 * ─── VÌ SAO DÙNG CALENDAR API CHỨ KHÔNG PHẢI MEET API ───
 *
 * Meet API (`spaces.create`) tạo được phòng nhưng KHÔNG đặt được tên — Space
 * không có trường tiêu đề (đã tra tài liệu). Mà yêu cầu là cuộc họp phải mang
 * tên board. Chỉ Calendar API làm được: `summary` của sự kiện chính là cái tên
 * hiện trong Meet.
 */
@Injectable({ providedIn: 'root' })
export class GoogleMeetService {
  private readonly firebase = inject(FirebaseService);

  /** Tài khoản này đã nối Google chưa — đọc thẳng từ Firebase, không cần cột DB. */
  daNoiGoogle(): boolean {
    return !!this.emailGoogle();
  }

  /** Email của tài khoản Google đã nối. `null` khi chưa nối. */
  emailGoogle(): string | null {
    const g = this.firebase.auth.currentUser?.providerData.find(
      (p) => p.providerId === 'google.com',
    );
    return g?.email ?? null;
  }

  /** Email đăng nhập của tài khoản hiện tại — mốc để đối chiếu khi liên kết. */
  emailDangNhap(): string | null {
    return this.firebase.auth.currentUser?.email ?? null;
  }

  /**
   * Nối tài khoản Google vào tài khoản mật khẩu đang đăng nhập.
   *
   * Đã nối rồi thì coi như xong, không báo lỗi — người dùng bấm hai lần không
   * phải là sai.
   */
  async noiGoogle(): Promise<string | null> {
    const user = this.firebase.auth.currentUser;
    if (!user) return 'You need to sign in first.';
    if (this.daNoiGoogle()) return null;

    const mongDoi = this.emailDangNhap();
    try {
      const res = await this.moPopup((p) => linkWithPopup(user, p), mongDoi);

      // Người dùng vẫn chọn được tài khoản Google KHÁC trong popup, dù ta đã
      // gợi ý sẵn bằng `login_hint`. Nối nhầm thì cuộc họp sẽ nằm trong lịch
      // của một tài khoản không phải họ — nên kiểm lại rồi GỠ nếu lệch.
      const daNoi = res.user.providerData.find((p) => p.providerId === 'google.com');
      if (mongDoi && daNoi?.email && daNoi.email.toLowerCase() !== mongDoi.toLowerCase()) {
        await unlink(user, 'google.com');
        return `You signed in as ${mongDoi} but picked the Google account ${daNoi.email}. Link the matching Google account instead.`;
      }
      return null;
    } catch (e) {
      return this.doiLoi(e);
    }
  }

  /** Gỡ liên kết Google. */
  async goLienKet(): Promise<string | null> {
    const user = this.firebase.auth.currentUser;
    if (!user) return 'You need to sign in first.';
    if (!this.daNoiGoogle()) return null;
    try {
      await unlink(user, 'google.com');
      return null;
    } catch {
      return 'Could not unlink the Google account. Try again.';
    }
  }

  /**
   * Tạo phòng họp mang tên board.
   *
   * Luôn mở popup: access token chỉ sống ~1 giờ và ta cố ý KHÔNG cất nó ở đâu
   * cả, nên mỗi lần tạo là xin lại một lần. Đây là cái giá của việc không giữ
   * bí mật dài hạn của người dùng — và nó chỉ xảy ra lúc MỞ cuộc họp, còn người
   * vào họp thì chỉ mở link đã lưu, không cần gì hết.
   */
  async taoPhongHop(tenBoard: string): Promise<KetQua> {
    const user = this.firebase.auth.currentUser;
    if (!user) return { error: 'You need to sign in first.' };

    let token: string | undefined;
    try {
      // Đã nối rồi thì `linkWithPopup` ném `provider-already-linked`;
      // `reauthenticateWithPopup` là đường đúng để xin lại token cho tài khoản
      // đã nối, và nó cũng trả về credential y hệt.
      const goiY = this.emailGoogle() ?? this.emailDangNhap();
      const daNoi = this.daNoiGoogle();
      const res = await this.moPopup(
        (p) => (daNoi ? reauthenticateWithPopup(user, p) : linkWithPopup(user, p)),
        goiY,
      );
      token = GoogleAuthProvider.credentialFromResult(res)?.accessToken;
    } catch (e) {
      return { error: this.doiLoi(e) ?? 'Could not get Google permission.' };
    }

    if (!token) {
      return { error: 'Google did not grant Calendar access. Please try again.' };
    }

    const batDau = new Date();
    const ketThuc = new Date(batDau.getTime() + THOI_LUONG_PHUT * 60_000);

    try {
      const res = await fetch(
        // `conferenceDataVersion=1` là BẮT BUỘC. Thiếu nó thì Google lặng lẽ bỏ
        // qua `conferenceData` — sự kiện vẫn tạo thành công nhưng KHÔNG có link
        // Meet nào, và ta chỉ phát hiện ở bước đọc kết quả.
        'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            summary: tenBoard,
            description: 'Created from Horizon Hub Harmony.',
            start: { dateTime: batDau.toISOString() },
            end: { dateTime: ketThuc.toISOString() },
            conferenceData: {
              createRequest: {
                // Google dùng chuỗi này để chống tạo trùng khi request bị gửi
                // lại — phải mới mỗi lần, nếu không nó trả về đúng phòng cũ.
                requestId: `hhh-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                conferenceSolutionKey: { type: 'hangoutsMeet' },
              },
            },
          }),
        },
      );

      if (!res.ok) return { error: await this.doiLoiGoogle(res) };

      const data = (await res.json()) as {
        hangoutLink?: string;
        conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
      };

      // `hangoutLink` là đường tắt tiện nhất, nhưng không phải lúc nào cũng có;
      // `entryPoints` mới là nguồn chính thức. Thử cả hai rồi mới chịu thua.
      const link =
        data.hangoutLink ??
        data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri;

      if (!link) {
        return { error: 'Google created the event but returned no Meet link. Please try again.' };
      }
      return { meetUrl: link };
    } catch {
      return { error: 'Could not reach Google Calendar. Check your connection.' };
    }
  }

  /**
   * Mở popup Google, có đường lui.
   *
   * `login_hint` chỉ là tiện nghi — nó giúp chọn sẵn đúng tài khoản, nhưng nếu
   * Google từ chối vì bất cứ lý do gì (chính sách Workspace của trường, một
   * quirk phía Google, tham số bị coi là không hợp lệ) thì KHÔNG được để nó
   * chặn cả tính năng. Thử lại một lần không kèm tham số nào.
   *
   * An toàn vì `login_hint` không phải hàng rào bảo mật: hàng rào thật là phép
   * đối chiếu email SAU khi nối, và phép đó vẫn chạy nguyên vẹn.
   *
   * Không thử lại khi người dùng tự đóng popup — đó là ý họ, mở lại là phiền.
   */
  private async moPopup(
    mo: (p: GoogleAuthProvider) => Promise<UserCredential>,
    loginHint?: string | null,
  ): Promise<UserCredential> {
    try {
      return await mo(this.taoProvider(loginHint));
    } catch (e) {
      const code = (e as { code?: string })?.code ?? '';
      const nguoiDungHuy =
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request' ||
        code === 'auth/popup-blocked';
      if (!loginHint || nguoiDungHuy) throw e;
      return mo(this.taoProvider(null));
    }
  }

  /**
   * `login_hint` chọn sẵn đúng tài khoản trong popup. Đây chỉ là GỢI Ý — Google
   * không ép, nên nơi gọi vẫn phải đối chiếu email sau khi nối.
   *
   * ⚠️ KHÔNG gửi kèm `prompt: 'select_account'`. Hai thứ đó MÂU THUẪN nhau:
   *    `login_hint` bảo Google GIẤU bảng chọn tài khoản và dùng luôn email đã
   *    chỉ định, còn `select_account` bảo Google BUỘC hiện bảng chọn. Gửi cả
   *    hai thì Google rơi vào trạng thái không xác định và trả về trang
   *    `accounts.google.com/info/unknownerror` — một trang lỗi trắng không nói
   *    gì, rất khó lần ra nguyên nhân.
   *
   *    Không có `login_hint` (không biết email) thì mới dùng `select_account`,
   *    để người đang đăng nhập nhiều tài khoản Google còn chọn được.
   */
  private taoProvider(loginHint?: string | null): GoogleAuthProvider {
    const p = new GoogleAuthProvider();
    p.addScope(SCOPE);
    p.setCustomParameters(
      loginHint ? { login_hint: loginHint } : { prompt: 'select_account' },
    );
    return p;
  }

  /** Lỗi Firebase → câu tiếng Việt nói đúng việc người dùng cần làm tiếp. */
  private doiLoi(e: unknown): string | null {
    const code = (e as { code?: string })?.code ?? '';
    switch (code) {
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        // Tự đóng popup không phải lỗi — đừng doạ người ta bằng toast đỏ.
        return null;
      case 'auth/popup-blocked':
        return 'Your browser blocked the Google window. Allow pop-ups and try again.';
      case 'auth/provider-already-linked':
        return null;
      case 'auth/credential-already-in-use':
      case 'auth/account-exists-with-different-credential':
        return 'That Google account is already linked to a different user here.';
      default:
        return 'Could not link your Google account. Please try again.';
    }
  }

  /** Lỗi HTTP từ Google → nói rõ nguyên nhân thật, đừng để người dùng đoán. */
  private async doiLoiGoogle(res: Response): Promise<string> {
    if (res.status === 401 || res.status === 403) {
      return 'Google denied calendar access. Check that the Calendar API is enabled and this account is in the OAuth test users list.';
    }
    if (res.status === 429) return 'Google is rate-limiting requests. Try again in a few minutes.';
    return `Google returned error ${res.status}. Please try again.`;
  }
}
