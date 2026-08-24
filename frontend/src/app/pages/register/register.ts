import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';


import { Toast, ToastType } from '../../models';
interface FieldErrors {
  fullName?: string;
  username?: string;
  phone?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}


const PHONE_RE = /^0\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


interface RegisterFormData {
  fullName: string;
  username: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
}

/**
 * Trang đăng ký tài khoản — dùng Firebase Auth thật (không còn giả lập).
 *
 * Vì sao Firebase chứ không Supabase Auth? Backend chỉ verify Firebase ID token và
 * `users.id` trong DB chính là Firebase uid. Dùng Supabase Auth sẽ sinh uuid thứ hai
 * cho cùng một người, và token không qua nổi FirebaseAuthGuard.
 *
 * Trùng email được Firebase báo về (auth/email-already-in-use) — không cần danh
 * sách "đã tồn tại" tự bịa ở frontend nữa.
 */
@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);


  // ---- Form fields ----
  fullName = '';
  username = '';
  phone = '';
  email = '';
  password = '';
  confirmPassword = '';

  readonly passwordVisible = signal(false);
  readonly confirmVisible = signal(false);
  readonly errors = signal<FieldErrors>({});
  readonly submitting = signal(false);

  // ---- Validate (frontend-only, chưa có backend/OTP thật) ----
  private validate(): FieldErrors {
    const errors: FieldErrors = {};
    const fullName = this.fullName.trim();
    const username = this.username.trim();
    const phone = this.phone.trim();
    const email = this.email.trim();

    if (!fullName) errors.fullName = 'Please enter your full name.';

    if (!username) errors.username = 'Please enter a username.';
    else if (username.length < 3) errors.username = 'Username must be at least 3 characters.';

    if (!phone) errors.phone = 'Please enter your phone number.';
    else if (!PHONE_RE.test(phone)) errors.phone = 'Invalid phone number (e.g. 0912345678).';

    if (!email) errors.email = 'Please enter your email.';
    else if (!EMAIL_RE.test(email)) errors.email = 'Invalid email format.';

    if (!this.password) errors.password = 'Please enter a password.';
    else if (this.password.length < 6) errors.password = 'Password must be at least 6 characters.';

    if (!this.confirmPassword) errors.confirmPassword = 'Please confirm your password.';
    else if (this.confirmPassword !== this.password) errors.confirmPassword = 'Passwords do not match.';

    return errors;
  }

  private runValidation(): boolean {
    const errors = this.validate();
    this.errors.set(errors);
    return Object.keys(errors).length === 0;
  }

  async onSubmit(): Promise<void> {
    if (!this.runValidation()) {
      this.addToast('Please check the fields marked in red.', 'error');
      return;
    }

    this.submitting.set(true);
    try {
      // Đăng ký THẬT qua Firebase Auth. Mật khẩu không đi qua server của chúng ta:
      // Firebase tự băm scrypt + salt riêng từng user, DB không có cột password.
      const { needsOnboarding } = await this.auth.registerWithEmail({
        email: this.email.trim(),
        password: this.password,
        displayName: this.fullName.trim(),
        username: this.username.trim(),
        phone: this.phone.trim(),
      });

      this.addToast(`Welcome, ${this.fullName.trim()}! Your account has been created.`, 'success');
      // Đăng ký xong là đã đăng nhập luôn — không bắt gõ lại mật khẩu.
      void this.router.navigateByUrl(needsOnboarding ? '/onboarding' : '/workspace');
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      switch (code) {
        case 'auth/email-already-in-use':
          this.errors.update((e) => ({ ...e, email: 'This email is already registered.' }));
          this.addToast('This email is already registered. Sign in or use a different email.', 'error');
          break;
        case 'auth/invalid-email':
          this.errors.update((e) => ({ ...e, email: 'Invalid email format.' }));
          this.addToast('Invalid email format.', 'error');
          break;
        case 'auth/weak-password':
          this.errors.update((e) => ({ ...e, password: 'Password is too weak (min. 6 characters).' }));
          this.addToast('Password is too weak — must be at least 6 characters.', 'error');
          break;
        case 'auth/operation-not-allowed':
          this.addToast('Email sign-up is not enabled in Firebase Console.', 'error');
          break;
        case 'auth/network-request-failed':
          this.addToast('Network connection lost. Check your connection and try again.', 'error');
          break;
        default: {
          // Backend trả 409 khi username đã có người dùng (ràng buộc UNIQUE ở DB).
          const status = (err as { status?: number })?.status;
          if (status === 409) {
            this.errors.update((e) => ({ ...e, username: 'This username is already taken.' }));
            this.addToast('This username is already taken — please choose another.', 'error');
            break;
          }
          this.addToast('Sign-up failed. Please try again.', 'error');
        }
      }
      console.error('[Register]', err);
    } finally {
      this.submitting.set(false);
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
