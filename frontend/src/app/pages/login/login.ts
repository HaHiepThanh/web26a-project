import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';


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
      this.addToast('Account created! Please sign in to continue.', 'success');
    }
  }

  /**
   * Đi đâu sau khi đăng nhập xong.
   *
   * `returnUrl` do trang khác gắn vào khi nó đá người chưa đăng nhập tới đây
   * (hiện có /join/:token). Không có nó thì người bấm link mời đăng nhập xong sẽ
   * rơi vào /workspace và mất hẳn lời mời đang cầm.
   *
   * ⚠️ Chỉ nhận đường dẫn nội bộ bắt đầu bằng MỘT dấu '/'. Chuỗi kiểu
   *    `//ke-xau.com` cũng hợp lệ với navigateByUrl nhưng trình duyệt hiểu là
   *    tên miền khác — đó là lỗ hổng chuyển hướng mở kinh điển.
   */
  private afterLoginUrl(needsOnboarding: boolean): string {
    if (needsOnboarding) return '/onboarding';
    const back = this.route.snapshot.queryParamMap.get('returnUrl') ?? '';
    if (back.startsWith('/') && !back.startsWith('//')) return back;
    return '/workspace';
  }

  togglePasswordVisible(): void {
    this.passwordVisible.update((v) => !v);
  }

  readonly passwordLoading = signal(false);

  async onPasswordSubmit(): Promise<void> {
    const email = this.username.trim();
    if (!email) {
      this.addToast('Please enter your email!', 'error');
      return;
    }
    if (!this.password) {
      this.addToast('Please enter your password!', 'error');
      return;
    }
    // Firebase chỉ nhận email, không nhận username. Nói rõ ngay thay vì để nó
    // trả về lỗi 'auth/invalid-email' khó hiểu.
    if (!email.includes('@')) {
      this.addToast('Sign in with your EMAIL, not a username.', 'error');
      return;
    }

    this.passwordLoading.set(true);
    try {
      const { needsOnboarding } = await this.auth.loginWithEmail(email, this.password);
      void this.router.navigateByUrl(this.afterLoginUrl(needsOnboarding));
    } catch (err) {
      this.addToast(this.describeLoginError(err), 'error');
    } finally {
      this.passwordLoading.set(false);
    }
  }

  /** Đổi mã lỗi Firebase thành câu tiếng Việt người dùng đọc hiểu. */
  private describeLoginError(err: unknown): string {
    const code = (err as { code?: string })?.code ?? '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Incorrect email or password.';
      case 'auth/invalid-email':
        return 'Invalid email.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Try again in a few minutes.';
      case 'auth/network-request-failed':
        return "Couldn't connect. Please check your network.";
      default:
        // Không phải lỗi Firebase → gần như chắc chắn là backend chưa chạy.
        return "Couldn't sign in. Is the backend running (npm run start:dev)?";
    }
  }

  // ---- Forgot password ----
  onForgotPasswordClick(): void {
    if (!this.username.trim()) {
      this.addToast('Please enter your email in the field above first.', 'info');
    }
  }

  // ---- Google (real Firebase auth) ----
  readonly googleLoading = signal(false);

  async onGoogleLogin(): Promise<void> {
    this.googleLoading.set(true);
    try {
      const { needsOnboarding } = await this.auth.loginWithGoogle();
      // Chưa thuộc tổ chức nào → đi tạo tổ chức trước. Có rồi → vào thẳng app
      // (/workspace tự chuyển sang /:orgSlug/workspace), hoặc quay lại đúng
      // trang đã đưa họ tới đây.
      void this.router.navigateByUrl(this.afterLoginUrl(needsOnboarding));
    } catch (err) {
      // Người dùng tự đóng popup thì không phải lỗi — đừng doạ họ bằng toast đỏ.
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;

      const message =
        code === 'auth/unauthorized-domain'
          ? 'This domain is not authorized yet in Firebase Console → Authentication → Settings → Authorized domains.'
          : code === 'auth/operation-not-allowed'
            ? 'The Google provider is not enabled in Firebase Console → Authentication → Sign-in method.'
            : 'Google sign-in failed. Please try again.';
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
