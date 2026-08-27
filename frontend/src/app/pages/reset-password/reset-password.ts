import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Toast, ToastType } from '../../models';
import { checkPassword, PasswordCheck } from '../../utils/password.util';

@Component({
  selector: 'app-reset-password',
  imports: [FormsModule, RouterLink],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.css',
})
export class ResetPassword implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /**
   * Loại hành động trong liên kết.
   *
   * Trang này là **action handler** của Firebase: khi đã trỏ Action URL về
   * `/auth/action` (Console → Authentication → Templates), NÓ NHẬN MỌI LOẠI
   * liên kết, không riêng đặt lại mật khẩu — bật xác minh email là `verifyEmail`
   * cũng về đây. Không phân nhánh thì trang sẽ cố "đặt lại mật khẩu" cho một mã
   * `verifyEmail` và báo một lỗi chẳng liên quan gì.
   */
  readonly mode = signal<'resetPassword' | 'verifyEmail' | 'recoverEmail' | 'khac'>(
    'resetPassword',
  );

  readonly oobCode = signal('');
  readonly userEmail = signal('');
  readonly verifying = signal(true);
  readonly validCode = signal(false);
  readonly verifyError = signal('');

  newPassword = '';
  confirmPassword = '';
  readonly passwordVisible = signal(false);
  readonly saving = signal(false);
  readonly success = signal(false);
  readonly toasts = signal<Toast[]>([]);

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    // Firebase có thể truyền action code qua oobCode hoặc code
    const code = params.get('oobCode') || params.get('code') || '';
    this.oobCode.set(code);

    // Thiếu `mode` thì coi là đặt lại mật khẩu: route `/reset-password` cũ
    // không có tham số này, và giữ nguyên đường đó chạy được.
    const mode = params.get('mode') ?? 'resetPassword';
    this.mode.set(
      mode === 'verifyEmail' || mode === 'recoverEmail' || mode === 'resetPassword'
        ? mode
        : 'khac',
    );

    if (!code) {
      this.verifying.set(false);
      this.validCode.set(false);
      this.verifyError.set('No reset code provided. Please use the link sent to your email.');
      return;
    }

    if (this.mode() === 'resetPassword') {
      void this.verifyCode(code);
      return;
    }
    void this.apDungMaKhac(code);
  }

  /**
   * Xác minh email / khôi phục email cũ — hai loại này KHÔNG có biểu mẫu.
   *
   * Chỉ cần áp mã rồi báo kết quả, nên dùng lại đúng hai trạng thái sẵn có của
   * trang: thành công hoặc lỗi.
   */
  private async apDungMaKhac(code: string): Promise<void> {
    this.verifying.set(true);
    try {
      if (this.mode() === 'khac') {
        // Firebase còn vài `mode` khác (`signIn`, `revertSecondFactorAddition`).
        // App chưa dùng cái nào — nói thẳng thay vì im lặng làm sai.
        throw new Error('unsupported-mode');
      }
      await this.auth.applyActionCode(code);
      this.validCode.set(true);
      this.success.set(true);
    } catch (err) {
      this.validCode.set(false);
      this.verifyError.set(
        (err as Error)?.message === 'unsupported-mode'
          ? 'This kind of link is not handled here. Open it from the original email, or contact support.'
          : this.describeVerifyError(err),
      );
    } finally {
      this.verifying.set(false);
    }
  }

  /** Tiêu đề màn thành công — khác nhau theo loại liên kết. */
  tieuDeThanhCong(): string {
    switch (this.mode()) {
      case 'verifyEmail':
        return 'Email verified!';
      case 'recoverEmail':
        return 'Email restored!';
      default:
        return 'Password Reset!';
    }
  }

  moTaThanhCong(): string {
    switch (this.mode()) {
      case 'verifyEmail':
        return 'Your email address is confirmed. You can sign in now.';
      case 'recoverEmail':
        return 'Your previous email address has been restored. We recommend resetting your password as well.';
      default:
        return 'Your password has been successfully updated. You can now sign in with your new credentials.';
    }
  }

  get passwordCheck(): PasswordCheck {
    return checkPassword(this.newPassword, {
      email: this.userEmail(),
    });
  }

  togglePasswordVisible(): void {
    this.passwordVisible.update((v) => !v);
  }

  addToast(message: string, type: ToastType = 'info'): void {
    const id = Date.now();
    this.toasts.update((t) => [...t, { id, message, type }]);
    setTimeout(() => this.removeToast(id), 5000);
  }

  removeToast(id: number): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }

  private async verifyCode(code: string): Promise<void> {
    this.verifying.set(true);
    try {
      const email = await this.auth.verifyResetCode(code);
      this.userEmail.set(email);
      this.validCode.set(true);
    } catch (err) {
      this.validCode.set(false);
      this.verifyError.set(this.describeVerifyError(err));
    } finally {
      this.verifying.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (!this.newPassword) {
      this.addToast('Please enter a new password.', 'error');
      return;
    }

    if (!this.passwordCheck.meetsPolicy) {
      this.addToast('Please ensure your password meets all requirements.', 'error');
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.addToast('Passwords do not match.', 'error');
      return;
    }

    this.saving.set(true);
    try {
      await this.auth.confirmReset(this.oobCode(), this.newPassword);
      this.success.set(true);
      this.addToast('Your password has been successfully reset!', 'success');
    } catch (err) {
      this.addToast(this.describeSubmitError(err), 'error');
    } finally {
      this.saving.set(false);
    }
  }

  private describeVerifyError(err: unknown): string {
    const code = (err as { code?: string })?.code ?? '';
    switch (code) {
      case 'auth/expired-action-code':
        return 'This password reset link has expired. Please request a new one.';
      case 'auth/invalid-action-code':
        return 'This reset link is invalid or has already been used. Please request a new link.';
      case 'auth/user-disabled':
        return 'The user account associated with this link has been disabled.';
      case 'auth/user-not-found':
        return 'No user found for this password reset request.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your internet connection.';
      default:
        return 'Unable to verify the password reset link. Please try again.';
    }
  }

  private describeSubmitError(err: unknown): string {
    const code = (err as { code?: string })?.code ?? '';
    switch (code) {
      case 'auth/weak-password':
        return 'Firebase rejected this password as too weak.';
      case 'auth/expired-action-code':
        return 'This password reset link has expired. Please request a new link.';
      case 'auth/invalid-action-code':
        return 'This reset link is invalid or has already been used.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your internet connection.';
      default:
        return (err as { message?: string })?.message ?? 'Failed to reset password. Please try again.';
    }
  }
}
