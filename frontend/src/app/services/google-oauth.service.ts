import { Injectable, inject } from '@angular/core';
import {
  GoogleAuthProvider,
  linkWithPopup,
  reauthenticateWithPopup,
  unlink,
  type User,
  type UserCredential,
} from 'firebase/auth';
import { FirebaseService } from './firebase.service';
import { ApiService } from './api.service';

/**
 * Quyền hẹp nhất đủ việc: tạo/sửa sự kiện lịch. KHÔNG xin
 * `.../auth/calendar` (đọc-ghi TOÀN BỘ lịch) — ta chỉ cần đụng tới những sự
 * kiện chính app này tạo ra, xin rộng hơn là bắt người dùng đánh đổi nhiều hơn
 * mức cần thiết, và cũng làm màn hình đồng ý của Google trông đáng ngại hơn.
 *
 * Cùng một scope phục vụ cả Meet (0008) lẫn lịch họp (0009): cả hai đều là
 * `events.insert` trên Calendar API, chỉ khác nội dung sự kiện.
 */
export const SCOPE_CALENDAR = 'https://www.googleapis.com/auth/calendar.events';

/**
 * LIÊN KẾT GOOGLE + LẤY ACCESS TOKEN — dùng chung cho mọi tính năng gọi Google.
 *
 * ─── VÌ SAO TÁCH RA KHỎI GoogleMeetService ───
 *
 * Ban đầu toàn bộ phần này nằm trong `GoogleMeetService`. Khi thêm tính năng
 * hẹn lịch họp, service thứ hai cũng cần y hệt: mở popup, đối chiếu email, xin
 * token, dịch lỗi. Chép sang là có HAI bản của cùng một luồng — và chỗ này đã
 * từng dính một lỗi rất khó lần ra (gửi cùng lúc `login_hint` và
 * `prompt=select_account`, xem `taoProvider`). Sửa một bản mà quên bản kia thì
 * lỗi đó sống lại ở nửa số đường gọi.
 *
 * ─── VÌ SAO GỌI GOOGLE TỪ TRÌNH DUYỆT, KHÔNG QUA BACKEND ───
 *
 * Firebase trả về access token của Google sau popup, nhưng KHÔNG kèm refresh
 * token. Token sống khoảng một giờ.
 *
 * Muốn backend tự gọi Google thì phải chạy một luồng OAuth riêng để lấy refresh
 * token rồi cất nó — một bí mật dài hạn mở được lịch của người dùng. Cất thứ đó
 * đòi mã hoá khi nghỉ, xoay khoá, đường thu hồi; và một lần rò là rò tài khoản
 * Google THẬT của họ. Đổi lại chỉ để bớt một cú popup.
 *
 * Nên: gọi thẳng từ tab đang mở, token sống trong bộ nhớ vài giây rồi mất.
 * Backend không bao giờ thấy token — nó chỉ nhận những chuỗi đã tạo xong.
 */
@Injectable({ providedIn: 'root' })
export class GoogleOauthService {
  private readonly firebase = inject(FirebaseService);
  private readonly api = inject(ApiService);

  /**
   * ─── KHE CẮM CHO TEST ───
   *
   * Bốn hàm dưới đây chỉ gói lại lời gọi thẳng tới `firebase/auth`, không có
   * logic gì. Chúng tồn tại để bài test thay được chúng bằng cách kế thừa lớp
   * này — mở popup thật trong test là điều không thể.
   *
   * ⚠️ CỐ Ý KHÔNG dùng `vi.mock('firebase/auth')`. Angular gộp mọi spec vào
   *    chung một bundle, nên mock ở cấp module có hiệu lực với CẢ những spec
   *    khác: thay `firebase/auth` một chỗ là `FirebaseService` mất `getAuth` và
   *    vài spec không liên quan đổ với lỗi rất khó lần ra. Đã dính đúng lỗi đó
   *    một lần rồi. Khe cắm bằng phương thức thì phạm vi ảnh hưởng đúng bằng
   *    một đối tượng.
   */
  protected goiLink(user: User, p: GoogleAuthProvider): Promise<UserCredential> {
    return linkWithPopup(user, p);
  }
  protected goiReauth(user: User, p: GoogleAuthProvider): Promise<UserCredential> {
    return reauthenticateWithPopup(user, p);
  }
  protected goiUnlink(user: User, providerId: string): Promise<User> {
    return unlink(user, providerId);
  }
  protected tokenTuKetQua(res: UserCredential): string | undefined {
    return GoogleAuthProvider.credentialFromResult(res)?.accessToken;
  }

  /** Tài khoản này đã nối Google chưa — đọc thẳng từ Firebase, không cần gọi API. */
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
      const res = await this.moPopup((p) => this.goiLink(user, p), mongDoi);

      // Người dùng vẫn chọn được tài khoản Google KHÁC trong popup, dù ta đã
      // gợi ý sẵn bằng `login_hint`. Nối nhầm thì cuộc họp sẽ nằm trong lịch
      // của một tài khoản không phải họ — nên kiểm lại rồi GỠ nếu lệch.
      const daNoi = res.user.providerData.find((p) => p.providerId === 'google.com');
      if (mongDoi && daNoi?.email && daNoi.email.toLowerCase() !== mongDoi.toLowerCase()) {
        await this.goiUnlink(user, 'google.com');
        return `You signed in as ${mongDoi} but picked the Google account ${daNoi.email}. Link the matching Google account instead.`;
      }
      await this.baoBackend();
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
      await this.goiUnlink(user, 'google.com');
      await this.baoBackend();
      return null;
    } catch {
      return 'Could not unlink the Google account. Try again.';
    }
  }

  /**
   * Xin access token của Google để gọi Calendar API.
   *
   * Luôn mở popup: token chỉ sống ~1 giờ và ta cố ý KHÔNG cất nó ở đâu cả, nên
   * mỗi lần dùng là xin lại một lần. Đây là cái giá của việc không giữ bí mật
   * dài hạn của người dùng — và nó chỉ xảy ra với người TẠO cuộc họp, còn người
   * tham dự thì chỉ mở link đã lưu, không cần gì hết.
   */
  async layToken(): Promise<{ token?: string; error?: string }> {
    const user = this.firebase.auth.currentUser;
    if (!user) return { error: 'You need to sign in first.' };

    try {
      // Đã nối rồi thì `linkWithPopup` ném `provider-already-linked`;
      // `reauthenticateWithPopup` là đường đúng để xin lại token cho tài khoản
      // đã nối, và nó cũng trả về credential y hệt.
      const goiY = this.emailGoogle() ?? this.emailDangNhap();
      const daNoi = this.daNoiGoogle();
      const res = await this.moPopup(
        (p) => (daNoi ? this.goiReauth(user, p) : this.goiLink(user, p)),
        goiY,
      );
      const token = this.tokenTuKetQua(res);
      if (!token) {
        return { error: 'Google did not grant Calendar access. Please try again.' };
      }
      // Vừa nối lần đầu qua đường này thì backend chưa biết — báo cho nó.
      if (!daNoi) await this.baoBackend();
      return { token };
    } catch (e) {
      return { error: this.doiLoi(e) ?? 'Could not get Google permission.' };
    }
  }

  /** Lỗi HTTP từ Google → nói rõ nguyên nhân thật, đừng để người dùng đoán. */
  doiLoiGoogle(status: number): string {
    if (status === 401 || status === 403) {
      return 'Google denied calendar access. Check that the Calendar API is enabled and this account is in the OAuth test users list.';
    }
    if (status === 429) return 'Google is rate-limiting requests. Try again in a few minutes.';
    return `Google returned error ${status}. Please try again.`;
  }

  // ------------------------------------------------------------------ nội bộ

  /**
   * Cho backend biết trạng thái liên kết vừa đổi.
   *
   * ⚠️ KHÔNG gửi cờ "đã nối" trong body. Backend suy ra từ claim
   *    `firebase.identities` của ID TOKEN đã verify chữ ký — tin client tự khai
   *    thì ai cũng bịa được "tôi đã nối Google" để lọt vào danh sách mời họp.
   *
   * Vì thế bước bắt buộc ở đây là `getIdToken(true)`: ID token chỉ tự làm mới
   * khoảng mỗi giờ, nên nếu không ép làm mới thì token gửi lên vẫn mang claim
   * CŨ, và backend kết luận ngược lại điều vừa xảy ra.
   *
   * Hỏng thì bỏ qua: liên kết phía Firebase đã xong rồi, và `POST /auth/sync`
   * còn chạy lại ở mọi lần mở app nên trạng thái sẽ tự đuổi kịp.
   */
  private async baoBackend(): Promise<void> {
    try {
      await this.firebase.auth.currentUser?.getIdToken(true);
      await this.api.post('/auth/sync', {});
    } catch {
      /* không chặn luồng người dùng vì một lần đồng bộ hụt */
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
    p.addScope(SCOPE_CALENDAR);
    p.setCustomParameters(loginHint ? { login_hint: loginHint } : { prompt: 'select_account' });
    return p;
  }

  /** Lỗi Firebase → câu nói đúng việc người dùng cần làm tiếp. */
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
}
