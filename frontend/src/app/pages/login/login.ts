import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { describeError } from '../../services/api-error.util';


import { Toast, ToastType } from '../../models';
/**
 * Trang đăng nhập. CẢ HAI cách đều là xác thực THẬT qua Firebase:
 *   - Email + mật khẩu → signInWithEmailAndPassword
 *   - Google           → signInWithPopup
 *
 * Sau khi Firebase xác thực xong, AuthService gọi `GET /auth/me` để backend ghi
 * hồ sơ vào database và cho biết user đã thuộc tổ chức nào chưa.
 *
 * ⚠️ Trước đây form mật khẩu là GIẢ LẬP: nó chỉ `setUser()` một uuid bịa sẵn rồi
 *    đi thẳng vào app. Hệ quả là không có Firebase ID token, nên MỌI request tới
 *    backend đều trả 401 và app trông như "không có dữ liệu gì cả".
 */
@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // ---- Password form ----
  username = '';
  password = '';
  remember = true;
  readonly passwordVisible = signal(false);

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const prefillUsername = params.get('username');
    if (prefillUsername) this.username = prefillUsername;
    if (params.get('registered')) {
      this.addToast('Đăng ký thành công! Vui lòng đăng nhập để tiếp tục.', 'success');
    }
  }

  togglePasswordVisible(): void {
    this.passwordVisible.update((v) => !v);
  }

  readonly passwordLoading = signal(false);

  async onPasswordSubmit(): Promise<void> {
    const email = this.username.trim();
    if (!email) {
      this.addToast('Vui lòng nhập email!', 'error');
      return;
    }
    if (!this.password) {
      this.addToast('Vui lòng nhập mật khẩu!', 'error');
      return;
    }
    // Firebase chỉ nhận email, không nhận username. Nói rõ ngay thay vì để nó
    // trả về lỗi 'auth/invalid-email' khó hiểu.
    if (!email.includes('@')) {
      this.addToast('Đăng nhập bằng EMAIL, không phải tên đăng nhập.', 'error');
      return;
    }

    this.passwordLoading.set(true);
    try {
      const { needsOnboarding } = await this.auth.loginWithEmail(email, this.password);
      void this.router.navigateByUrl(needsOnboarding ? '/onboarding' : '/workspace');
    } catch (err) {
      this.addToast(this.describeLoginError(err), 'error');
    } finally {
      this.passwordLoading.set(false);
    }
  }

  /**
   * Đổi mã lỗi Firebase thành câu tiếng Việt người dùng đọc hiểu.
   *
   * ⚠️ Nhánh mặc định TRƯỚC ĐÂY trả thẳng "Backend đã chạy chưa?" cho mọi lỗi
   * không có mã Firebase. Nghe thì hợp lý nhưng nó đoán mò, và đã một lần khiến
   * cả buổi đi tìm sai chỗ: nguyên nhân thật là environment.ts chưa được điền
   * (còn nguyên 'YOUR_FIREBASE_API_KEY'), backend chạy hoàn toàn bình thường.
   * Giờ mỗi loại hỏng hóc nói đúng tên của nó, và thứ gì không nhận ra thì in
   * mã lỗi thật ra thay vì bịa một nguyên nhân.
   */
  private describeLoginError(err: unknown): string {
    const code = (err as { code?: string })?.code ?? '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Email hoặc mật khẩu không đúng.';
      case 'auth/invalid-email':
        return 'Email không hợp lệ.';
      case 'auth/too-many-requests':
        return 'Sai quá nhiều lần. Thử lại sau vài phút nhé.';
      case 'auth/network-request-failed':
        return 'Không kết nối được. Kiểm tra mạng giúp mình.';

      // Cấu hình client sai — KHÔNG liên quan gì tới backend.
      case 'auth/invalid-api-key':
      case 'auth/api-key-not-valid':
      case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      case 'auth/configuration-not-found':
        return 'Cấu hình Firebase chưa đúng. Kiểm tra frontend/src/environments/environment.ts.';
      case 'auth/operation-not-allowed':
        return 'Firebase chưa bật đăng nhập bằng email/mật khẩu cho dự án này.';
    }

    // Lỗi HTTP: Firebase đã xác thực xong, hỏng ở bước gọi backend (GET /auth/me).
    // describeError phân biệt được "không gọi tới nơi" (status 0) với "gọi tới
    // nơi nhưng bị từ chối", nên để nó trả lời thay vì đoán.
    if (err instanceof HttpErrorResponse) {
      return describeError(err, 'Đăng nhập được nhưng không tải được hồ sơ từ máy chủ.');
    }

    // Còn lại: nói thật là không rõ, kèm mã để còn lần ra.
    const chiTiet = code || (err as { message?: string })?.message || '';
    return chiTiet
      ? `Không đăng nhập được (${chiTiet}).`
      : 'Không đăng nhập được. Thử lại giúp mình nhé.';
  }

  // ---- Forgot password ----
  onForgotPasswordClick(): void {
    if (!this.username.trim()) {
      this.addToast('Vui lòng nhập email của bạn vào ô đăng nhập trước.', 'info');
    }
  }

  // ---- Google (real Firebase auth) ----
  readonly googleLoading = signal(false);

  async onGoogleLogin(): Promise<void> {
    this.googleLoading.set(true);
    try {
      const { needsOnboarding } = await this.auth.loginWithGoogle();
      // Chưa thuộc tổ chức nào → đi tạo tổ chức trước. Có rồi → vào thẳng app
      // (/workspace tự chuyển sang /:orgSlug/workspace).
      void this.router.navigateByUrl(needsOnboarding ? '/onboarding' : '/workspace');
    } catch (err) {
      // Người dùng tự đóng popup thì không phải lỗi — đừng doạ họ bằng toast đỏ.
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;

      const message =
        code === 'auth/unauthorized-domain'
          ? 'Tên miền này chưa được cho phép trong Firebase Console → Authentication → Settings → Authorized domains.'
          : code === 'auth/operation-not-allowed'
            ? 'Nhà cung cấp Google chưa được bật trong Firebase Console → Authentication → Sign-in method.'
            : 'Đăng nhập Google thất bại. Vui lòng thử lại.';
      this.addToast(message, 'error');
      console.error('[Google login]', err);
    } finally {
      this.googleLoading.set(false);
    }
  }

  // ---- Toasts ----
  private toastSeq = 0;
  readonly toasts = signal<Toast[]>([]);

  addToast(message: string, type: ToastType = 'info'): void {
    const id = ++this.toastSeq;
    this.toasts.update((list) => [...list, { id, message, type }]);
    setTimeout(() => {
      this.toasts.update((list) => list.filter((t) => t.id !== id));
    }, 3200);
  }
}
