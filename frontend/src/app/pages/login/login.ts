import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

type ToastType = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

/**
 * Trang đăng nhập (ported từ prototype login/ — vanilla HTML/CSS/TS).
 * Google = xác thực thật qua AuthService (Firebase). Mật khẩu là phương thức demo
 * (chưa có backend tương ứng) — vào thẳng Workspace, không hiển thị bước trung gian.
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

  onPasswordSubmit(): void {
    if (!this.username.trim()) {
      this.addToast('Vui lòng nhập tên đăng nhập hoặc email!', 'error');
      return;
    }
    if (!this.password.trim()) {
      this.addToast('Vui lòng nhập mật khẩu!', 'error');
      return;
    }
    const input = this.username.trim();
    // Check if user already exists in searchable users
    const existing = this.auth.getSearchableUsers().find(
      (u) =>
        u.email.toLowerCase() === input.toLowerCase() ||
        (u.username && u.username.toLowerCase() === input.toLowerCase()) ||
        (u.displayName && u.displayName.toLowerCase() === input.toLowerCase()),
    );
    if (existing) {
      this.auth.setUser(existing);
    } else {
      const isEmail = input.includes('@');
      this.auth.setUser({
        id: this.auth.findUserByUuid(input)?.id ?? this.auth.currentUser()?.id ?? '8f4c2e10-9b3a-4e2a-871d-5b3a1a2e3f40',
        displayName: isEmail ? input.split('@')[0] : input,
        email: isEmail ? input : `${input}@trello.dev`,
      });
    }
    // Demo: vào thẳng Workspace, không delay/không hiển thị màn chào trung gian.
    void this.router.navigateByUrl('/workspace');
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
