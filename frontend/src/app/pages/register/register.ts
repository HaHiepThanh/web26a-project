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

    if (!fullName) errors.fullName = 'Vui lòng nhập họ và tên.';

    if (!username) errors.username = 'Vui lòng nhập tên đăng nhập.';
    else if (username.length < 3) errors.username = 'Tên đăng nhập cần tối thiểu 3 ký tự.';

    if (!phone) errors.phone = 'Vui lòng nhập số điện thoại.';
    else if (!PHONE_RE.test(phone)) errors.phone = 'Số điện thoại không hợp lệ (VD: 0912345678).';

    if (!email) errors.email = 'Vui lòng nhập email.';
    else if (!EMAIL_RE.test(email)) errors.email = 'Email không đúng định dạng.';

    if (!this.password) errors.password = 'Vui lòng nhập mật khẩu.';
    else if (this.password.length < 6) errors.password = 'Mật khẩu cần tối thiểu 6 ký tự.';

    if (!this.confirmPassword) errors.confirmPassword = 'Vui lòng nhập lại mật khẩu.';
    else if (this.confirmPassword !== this.password) errors.confirmPassword = 'Mật khẩu nhập lại không khớp.';

    return errors;
  }

  private runValidation(): boolean {
    const errors = this.validate();
    this.errors.set(errors);
    return Object.keys(errors).length === 0;
  }

  async onSubmit(): Promise<void> {
    if (!this.runValidation()) {
      this.addToast('Vui lòng kiểm tra lại các trường được đánh dấu đỏ.', 'error');
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

      this.addToast(`Chào mừng ${this.fullName.trim()}! Tài khoản đã được tạo.`, 'success');
      // Đăng ký xong là đã đăng nhập luôn — không bắt gõ lại mật khẩu.
      void this.router.navigateByUrl(needsOnboarding ? '/onboarding' : '/workspace');
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      switch (code) {
        case 'auth/email-already-in-use':
          this.errors.update((e) => ({ ...e, email: 'Email này đã được đăng ký.' }));
          this.addToast('Email này đã được đăng ký. Hãy đăng nhập hoặc dùng email khác.', 'error');
          break;
        case 'auth/invalid-email':
          this.errors.update((e) => ({ ...e, email: 'Email không đúng định dạng.' }));
          this.addToast('Email không đúng định dạng.', 'error');
          break;
        case 'auth/weak-password':
          this.errors.update((e) => ({ ...e, password: 'Mật khẩu quá yếu (tối thiểu 6 ký tự).' }));
          this.addToast('Mật khẩu quá yếu — cần tối thiểu 6 ký tự.', 'error');
          break;
        case 'auth/operation-not-allowed':
          this.addToast('Đăng ký bằng email chưa được bật trong Firebase Console.', 'error');
          break;
        case 'auth/network-request-failed':
          this.addToast('Mất kết nối mạng. Kiểm tra lại đường truyền rồi thử lại.', 'error');
          break;
        default: {
          // Backend trả 409 khi username đã có người dùng (ràng buộc UNIQUE ở DB).
          const status = (err as { status?: number })?.status;
          if (status === 409) {
            this.errors.update((e) => ({ ...e, username: 'Tên đăng nhập này đã được sử dụng.' }));
            this.addToast('Tên đăng nhập này đã được sử dụng, chọn tên khác nhé.', 'error');
            break;
          }
          this.addToast('Đăng ký thất bại. Vui lòng thử lại.', 'error');
        }
      }
      console.error('[Đăng ký]', err);
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
