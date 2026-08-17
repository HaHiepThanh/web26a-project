import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
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

  // ---- Password form ----
  username = '';
  password = '';
  remember = true;
  readonly passwordVisible = signal(false);

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
    // Demo: vào thẳng Workspace, không delay/không hiển thị màn chào trung gian.
    void this.router.navigateByUrl('/workspace');
  }

  // ---- Forgot password ----
  onForgotPasswordClick(): void {
    if (!this.username.trim()) {
      this.addToast('Vui lòng nhập email của bạn vào ô đăng nhập trước.', 'info');
    }
  }

  // ---- Guest bypass (dev/demo — Firebase chưa cấu hình nên chưa đăng nhập thật được) ----
  continueAsGuest(): void {
    void this.router.navigateByUrl('/workspace');
  }

  // ---- Google (real Firebase auth) ----
  readonly googleLoading = signal(false);

  async onGoogleLogin(): Promise<void> {
    this.googleLoading.set(true);
    try {
      await this.auth.loginWithGoogle();
      void this.router.navigateByUrl('/workspace');
    } catch {
      this.addToast('Đăng nhập Google thất bại. Vui lòng thử lại.', 'error');
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
