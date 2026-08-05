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
interface DemoUser {
  name: string;
  email: string;
  initials: string;
}

function toFormattedName(raw: string): string {
  const username = raw.includes('@') ? raw.split('@')[0] : raw;
  return (
    username
      .split(/[._-]/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ') || 'Khách Demo'
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? 'K';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/**
 * Trang đăng nhập (ported từ prototype login/ — vanilla HTML/CSS/TS).
 * Google = xác thực thật qua AuthService (Firebase). Mật khẩu là phương thức demo
 * (chưa có backend tương ứng) — giữ nguyên hiệu ứng gốc nhưng không tạo phiên đăng
 * nhập thật, không điều hướng đi.
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
  readonly submitting = signal(false);

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

    this.submitting.set(true);
    setTimeout(() => {
      const name = toFormattedName(this.username);
      const email = this.username.includes('@') ? this.username : `${this.username}@trello.com`;
      this.submitting.set(false);
      this.showDemoSuccess({ name, email, initials: initialsOf(name) });
      this.addToast(`Chào mừng quay trở lại, ${name}!`, 'success');
    }, 900);
  }

  // ---- Forgot password ----
  onForgotPasswordClick(): void {
    if (!this.username.trim()) {
      this.addToast('Vui lòng nhập email của bạn vào ô đăng nhập trước.', 'info');
    }
  }

  // ---- Demo success view (password) ----
  readonly demoUser = signal<DemoUser | null>(null);

  private showDemoSuccess(user: DemoUser): void {
    this.demoUser.set(user);
  }

  resetToAuthView(): void {
    this.demoUser.set(null);
    this.addToast('Đã đăng xuất khỏi bản demo.', 'info');
  }

  // ---- Guest bypass (dev/demo — Firebase chưa cấu hình nên chưa đăng nhập thật được) ----
  continueAsGuest(): void {
    this.addToast('Đang vào chế độ khách...', 'info');
    this.router.navigateByUrl('/workspace');
  }

  // ---- Google (real Firebase auth) ----
  readonly googleLoading = signal(false);

  async onGoogleLogin(): Promise<void> {
    this.googleLoading.set(true);
    try {
      await this.auth.loginWithGoogle();
      const user = this.auth.currentUser();
      this.addToast(`Đã đăng nhập bằng Google${user?.displayName ? ' — chào ' + user.displayName : ''}!`, 'success');
      setTimeout(() => this.router.navigateByUrl('/dashboard'), 500);
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
