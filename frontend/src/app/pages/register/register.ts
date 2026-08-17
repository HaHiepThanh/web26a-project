import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MOCK_MEMBERS } from '../../services/board.service';
import { AuthService } from '../../services/auth.service';
import { User, generateUuid } from '../../models';

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

/** Chế độ hệ thống "đã bấm nút giả lập" — chỉ áp dụng cho LẦN Đăng ký tiếp theo rồi tự
 *  tắt, cùng ý tưởng với armNetworkFailure() ở board.ts (giả lập lỗi mạng khi kéo-thả). */
type SystemSimMode = 'normal' | 'slow' | 'server-error';

const PHONE_RE = /^0\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RANDOM_NAMES = ['Đặng Gia Hân', 'Vũ Minh Quân', 'Ngô Thảo Vy', 'Bùi Anh Tuấn', 'Đỗ Ngọc Diệp', 'Hoàng Bảo Châu'];

interface RegisterFormData {
  fullName: string;
  username: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
}

function randomValidData(): RegisterFormData {
  const seq = Math.floor(1000 + Math.random() * 9000);
  const name = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
  const phoneTail = String(Math.floor(100000000 + Math.random() * 899999999)).slice(0, 9);
  return {
    fullName: name,
    username: `user${seq}`,
    phone: `0${phoneTail}`,
    email: `user${seq}@example.com`,
    password: 'Passw0rd!',
    confirmPassword: 'Passw0rd!',
  };
}

/** Danh sách username/email "đã tồn tại trong CSDL" cho kịch bản trùng lặp — dùng lại
 *  đúng roster thành viên demo của app (board.service.ts) thay vì bịa thêm 1 danh sách rời. */
const TAKEN_EMAILS = new Set(MOCK_MEMBERS.map((m) => m.email.toLowerCase()));
const TAKEN_USERNAMES = new Set(MOCK_MEMBERS.map((m) => (m.displayName ?? m.email).toLowerCase().replace(/\s+/g, '')));

/**
 * Trang đăng ký tài khoản, kèm Bộ công cụ Giả lập (Simulation Toolbar) phục vụ
 * QA/demo: điền nhanh các kịch bản hợp lệ/lỗi thay vì gõ tay, cộng 2 nút "cài đặt
 * sẵn" trạng thái hệ thống (mạng chậm / lỗi 500) cho LẦN bấm "Đăng ký" kế tiếp.
 * Tự động cấp mã UUID v4 và lưu hồ sơ người dùng.
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

  // ---- Simulation toolbar: nhóm "luồng thành công" + "edge case" — điền dữ liệu rồi
  // validate ngay để thấy kết quả tức thì, không cần bấm Đăng ký thêm 1 lần nữa ----
  autoFillValid(): void {
    Object.assign(this, randomValidData());
    this.errors.set({});
    this.addToast('🎲 Đã điền dữ liệu hợp lệ ngẫu nhiên.', 'info');
  }

  fillDuplicate(): void {
    Object.assign(this, randomValidData());
    const dup = MOCK_MEMBERS[Math.floor(Math.random() * MOCK_MEMBERS.length)];
    this.username = (dup.displayName ?? dup.email).toLowerCase().replace(/\s+/g, '');
    this.email = dup.email;
    this.runValidation();
    this.addToast('❌ Đã điền Username/Email trùng với tài khoản có sẵn.', 'error');
  }

  fillInvalidFormat(): void {
    Object.assign(this, randomValidData());
    this.phone = '09a1b2'; // thiếu số, lẫn chữ
    this.email = 'sai-dinh-dang.example.com'; // thiếu ký tự @
    this.runValidation();
    this.addToast('❌ Đã điền SĐT và Email sai định dạng.', 'error');
  }

  fillPasswordMismatch(): void {
    Object.assign(this, randomValidData());
    this.confirmPassword = this.password + 'x';
    this.runValidation();
    this.addToast('❌ Đã điền 2 mật khẩu KHÔNG khớp nhau.', 'error');
  }

  // ---- Simulation toolbar: nhóm "trạng thái hệ thống" — chỉ CÀI ĐẶT chế độ, hiệu ứng
  // thật sự xảy ra khi bấm "Đăng ký tài khoản" bên dưới (xem onSubmit) ----
  readonly systemSimMode = signal<SystemSimMode>('normal');

  armSlowNetwork(): void {
    this.systemSimMode.update((m) => (m === 'slow' ? 'normal' : 'slow'));
  }

  armServerError(): void {
    this.systemSimMode.update((m) => (m === 'server-error' ? 'normal' : 'server-error'));
  }

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
    else if (TAKEN_USERNAMES.has(username.toLowerCase())) errors.username = 'Tên đăng nhập này đã được sử dụng.';

    if (!phone) errors.phone = 'Vui lòng nhập số điện thoại.';
    else if (!PHONE_RE.test(phone)) errors.phone = 'Số điện thoại không hợp lệ (VD: 0912345678).';

    if (!email) errors.email = 'Vui lòng nhập email.';
    else if (!EMAIL_RE.test(email)) errors.email = 'Email không đúng định dạng.';
    else if (TAKEN_EMAILS.has(email.toLowerCase())) errors.email = 'Email này đã được đăng ký.';

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

    const mode = this.systemSimMode();
    this.systemSimMode.set('normal'); // dùng 1 lần rồi tự tắt, như armNetworkFailure() ở Board
    this.submitting.set(true);

    await new Promise((resolve) => setTimeout(resolve, mode === 'slow' ? 3000 : 700));

    if (mode === 'server-error') {
      this.submitting.set(false);
      this.addToast('💥 Lỗi hệ thống (500) — vui lòng thử lại sau.', 'error');
      return;
    }

    const newUserId = generateUuid();
    const newUser: User = {
      id: newUserId,
      displayName: this.fullName.trim(),
      email: this.email.trim(),
      avatarUrl: '',
    };
    this.auth.setUser(newUser);

    this.submitting.set(false);
    this.addToast(`Chào mừng ${this.fullName.trim()}! Đã tạo tài khoản (UUID: ${newUserId.slice(0, 8)}...)`, 'success');
    setTimeout(() => this.router.navigateByUrl('/workspace'), 800);
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
