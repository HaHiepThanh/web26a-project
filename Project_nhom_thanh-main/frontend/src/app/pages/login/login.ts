import { Component, computed, inject, signal } from '@angular/core';
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

type QrCell = { i: number; j: number };
type QrStep2State = 'pending' | 'active' | 'done';
type QrStep3State = 'pending' | 'active' | 'verified';

const QR_GRID_SIZE = 21; // 126px / 6px mỗi ô (khớp viewBox trong login.html)

/** Hoạ tiết QR giả (không phải mã thật) — cùng công thức pseudo-random đơn giản
 *  đã dùng cho QR 2FA ở settings.ts, chỉ phóng lên lưới 21x21 cho khớp viewBox. */
function buildQrCells(): QrCell[] {
  const cells: QrCell[] = [];
  for (let i = 0; i < QR_GRID_SIZE; i++) {
    for (let j = 0; j < QR_GRID_SIZE; j++) {
      if ((i * 7 + j * 3 + i * j) % 5 === 0) cells.push({ i, j });
    }
  }
  return cells;
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

  // ---- Chuyển đổi phương thức đăng nhập (Mật khẩu / Quét mã QR) ----
  readonly activeMethod = signal<'password' | 'qr'>('password');

  setMethod(method: 'password' | 'qr'): void {
    this.activeMethod.set(method);
    if (method === 'qr') this.resetQrState();
  }

  // ---- Quét mã QR (demo — không có WebAuthn/socket thật, mô phỏng bằng timer) ----
  readonly qrCells = buildQrCells();
  readonly qrSimulating = signal(false);
  readonly viewfinderVisible = signal(false);
  readonly viewfinderVerified = signal(false);
  readonly vfChecking = signal(true);
  readonly vfText = signal('Đang nhận diện mã...');
  readonly qrStep2 = signal<QrStep2State>('pending');
  readonly qrStep3 = signal<QrStep3State>('pending');
  readonly line1Filled = signal(false);
  readonly line2Filled = signal(false);

  private resetQrState(): void {
    this.qrSimulating.set(false);
    this.viewfinderVisible.set(false);
    this.viewfinderVerified.set(false);
    this.vfChecking.set(true);
    this.vfText.set('Đang nhận diện mã...');
    this.qrStep2.set('pending');
    this.qrStep3.set('pending');
    this.line1Filled.set(false);
    this.line2Filled.set(false);
  }

  /** Nút "Mô phỏng: điện thoại vừa quét mã" — chạy tuần tự nhận diện → xác
   *  thực → thành công, cùng nhịp độ demo với onPasswordSubmit/onBiometricLogin. */
  onQrSimulate(): void {
    if (this.qrSimulating()) return;
    this.resetQrState();
    this.qrSimulating.set(true);
    this.viewfinderVisible.set(true);
    this.qrStep2.set('active');
    this.line1Filled.set(true);

    setTimeout(() => {
      this.qrStep2.set('done');
      this.qrStep3.set('active');
      this.line2Filled.set(true);
      this.vfText.set('Đang xác thực...');
    }, 900);

    setTimeout(() => {
      this.vfChecking.set(false);
      this.vfText.set('Xác thực thành công!');
      this.viewfinderVerified.set(true);
      this.qrStep3.set('verified');
    }, 1700);

    setTimeout(() => {
      this.qrSimulating.set(false);
      this.showDemoSuccess({ name: 'Người dùng Demo', email: 'demo@trellopro.io', initials: 'DU' });
      this.addToast('Đăng nhập bằng QR thành công!', 'success');
    }, 2500);
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

  // ---- Vân tay / Face ID (demo — không có backend WebAuthn thật, giả lập
  //      giống hệt phương thức mật khẩu: quét xong hiện success-view demo) ----
  readonly biometricActive = signal(false);
  readonly biometricLabel = computed(() => (this.biometricActive() ? 'Đang xác thực...' : 'Vân tay / Face ID'));

  onBiometricLogin(): void {
    this.biometricActive.set(true);
    setTimeout(() => {
      this.biometricActive.set(false);
      this.showDemoSuccess({ name: 'Người dùng Demo', email: 'demo@trellopro.io', initials: 'DU' });
      this.addToast('Xác thực vân tay thành công!', 'success');
    }, 1400);
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
