import { Component, effect, inject, input, output, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import {
  LucideCamera,
  LucideCheck,
  LucideCopy,
  LucideKeyRound,
  LucideLock,
  LucideSave,
} from '@lucide/angular';
import { User } from '../../../models';
import { initialsOf } from '../../../mocks';
import { AuthService } from '../../../services/auth.service';
import { checkPassword, type PasswordCheck } from '../../../utils/password.util';

/** Confirms the two password fields match; attached at the FormGroup level. */
function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const newPassword = group.get('newPassword')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  if (!newPassword || !confirmPassword) return null;
  return newPassword === confirmPassword ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-profile-tab',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    LucideCamera,
    LucideCheck,
    LucideCopy,
    LucideKeyRound,
    LucideLock,
    LucideSave,
  ],
  templateUrl: './profile-tab.html',
  host: { class: 'block' },
})
export class ProfileTab {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  readonly currentUser = input<User | null>(null);

  readonly saveProfile = output<User>();
  // Không còn output `changePassword`: việc đổi mật khẩu gọi thẳng AuthService
  // ngay trong component này (như `updateProfile` ở dưới), vì chỉ ở đây mới biết
  // kết quả để quyết định có được xoá form hay không.
  readonly flashMessage = output<{ message: string; type?: 'success' | 'error' | 'info' }>();

  /**
   * Hồ sơ vừa đổi THẬT trên server (ảnh đại diện đặt/gỡ xong).
   *
   * Cần báo ra ngoài vì `AuthService.currentUser` chỉ là bản sao của RIÊNG tôi.
   * Tên và ảnh hiển thị ở danh sách thành viên workspace, ô người phụ trách,
   * avatar trong board và trong chat đều đọc từ `OrganizationStore.membersByOrg`
   * — thứ nạp một lần lúc mở app rồi nằm im. Không báo thì góc phải màn hình
   * đổi ảnh ngay còn mọi chỗ khác vẫn giữ ảnh cũ cho tới lần F5 kế tiếp.
   */
  readonly profileChanged = output<void>();

  readonly initialsOf = initialsOf;
  readonly avatarPreview = signal<string | null>(null);
  /** Đang lưu avatar (upload/gỡ) — khoá 2 nút lại, tránh bấm chồng trong lúc chờ. */
  readonly savingAvatar = signal(false);
  /** Dang goi Firebase doi mat khau — khoa nut, tranh bam chong. */
  readonly savingPassword = signal(false);
  readonly copiedUuid = signal(false);

  readonly profileForm: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    username: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9_.]{3,25}$/)]],
    jobTitle: [''],
    email: [{ value: '', disabled: true }],
    phone: ['', [Validators.pattern(/^(0|\+84)[0-9]{9,10}$/)]],
  });

  readonly passwordForm: FormGroup = this.fb.group(
    {
      currentPassword: ['', [Validators.required]],
      // Chinh sach that nam trong `password.util.ts` — dung chung voi trang dang
      // ky de hai cho khong bao gio doi hoi hai thu khac nhau.
      newPassword: ['', [Validators.required, (c: AbstractControl) => this.kiemChinhSach(c)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatchValidator },
  );

  /** Đánh giá mật khẩu mới — vừa để vẽ thanh, vừa để liệt kê điều kiện còn thiếu. */
  get passwordCheck(): PasswordCheck {
    return this.danhGia(this.passwordForm.get('newPassword')?.value ?? '');
  }

  private danhGia(value: string): PasswordCheck {
    const u = this.currentUser();
    return checkPassword(value, {
      email: u?.email,
      username: u?.username,
      displayName: u?.displayName,
    });
  }

  /** Trả lời cho form biết mật khẩu đã đạt chính sách chưa. Ô trống thì để
   *  `Validators.required` báo — không chồng hai thông báo lên nhau. */
  private kiemChinhSach(control: AbstractControl): ValidationErrors | null {
    const value = (control.value ?? '') as string;
    if (!value) return null;
    return this.danhGia(value).meetsPolicy ? null : { passwordPolicy: true };
  }

  constructor() {
    effect(() => {
      const user = this.currentUser();
      if (!user) return;
      this.avatarPreview.set(user.avatarUrl ?? null);
      this.profileForm.patchValue({
        fullName: user.displayName ?? '',
        // Hiện đúng giá trị trong DB. Trước đây chỗ này lấy tạm phần trước @ của
        // email khi username rỗng — nhìn như đã có nhưng thực tế chưa hề được lưu.
        username: user.username ?? '',
        jobTitle: user.jobTitle ?? '',
        email: user.email ?? '',
        phone: user.phone ?? '',
      });
    });
  }

  /**
   * Đổi ảnh đại diện lưu THẲNG qua AuthService, chỉ gửi đúng field `avatarUrl`
   * — KHÔNG gộp chung với `user` rồi bắn qua `saveProfile` (output đó đi tới
   * `Settings.onSaveProfile`, ép `username ?? ''`/`phone ?? ''` cho MỌI field
   * kể cả 2 field không hề đụng tới; user chưa từng điền username/phone thì
   * request luôn bị 400 dù chỉ đang đổi ảnh — không phải lỗi ở avatar).
   *
   * Cũng CHỜ kết quả thật trước khi báo thành công: bản trước báo "Avatar
   * updated." ngay khi đọc xong file, trước khi biết lưu có ăn hay không —
   * lưu thất bại thì thông báo "thành công" vẫn hiện, còn preview vẫn giữ ảnh
   * mới mãi tới khi F5 (2 nơi khác trạng thái: avatar lớn đổi, avatar ở header
   * không đổi, không có lỗi nào báo ra ngoài).
   */
  async onUploadAvatar(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      this.flashMessage.emit({ message: 'Avatar image must be smaller than 2MB.', type: 'error' });
      return;
    }

    const previous = this.avatarPreview();
    const previewUrl = URL.createObjectURL(file);
    this.avatarPreview.set(previewUrl);
    this.savingAvatar.set(true);

    try {
      const avatarUrl = await this.authService.uploadAvatar(file);
      this.avatarPreview.set(avatarUrl);
      this.flashMessage.emit({ message: 'Avatar updated.', type: 'success' });
      this.profileChanged.emit();
    } catch (err) {
      this.avatarPreview.set(previous);
      this.flashMessage.emit({ message: this.describeProfileError(err, 'Failed to update avatar.'), type: 'error' });
    } finally {
      URL.revokeObjectURL(previewUrl);
      this.savingAvatar.set(false);
    }
  }

  async onRemoveAvatar(): Promise<void> {
    const previous = this.avatarPreview();
    if (!previous) return; // không có ảnh thì không có gì để gỡ
    this.avatarPreview.set(null);
    this.savingAvatar.set(true);
    try {
      await this.authService.updateProfile({ avatarUrl: '' });
      this.flashMessage.emit({ message: 'Avatar removed.', type: 'info' });
      this.profileChanged.emit();
    } catch (err) {
      this.avatarPreview.set(previous);
      this.flashMessage.emit({ message: this.describeProfileError(err, 'Failed to remove avatar.'), type: 'error' });
    } finally {
      this.savingAvatar.set(false);
    }
  }

  private describeProfileError(err: unknown, fallback: string): string {
    const detail = (err as { error?: { message?: string | string[] } })?.error?.message;
    return Array.isArray(detail) ? detail[0] : (detail ?? fallback);
  }

  copyUuid(): void {
    const uuid = this.currentUser()?.id;
    if (!uuid) return;
    navigator.clipboard.writeText(uuid).then(() => {
      this.copiedUuid.set(true);
      setTimeout(() => this.copiedUuid.set(false), 2000);
      this.flashMessage.emit({ message: 'Copied your UUID.', type: 'success' });
    });
  }

  onSubmitProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      this.flashMessage.emit({ message: 'Please check the form fields.', type: 'error' });
      return;
    }

    const val = this.profileForm.getRawValue();
    const cur = this.currentUser();
    if (cur) {
      const updated: User = {
        ...cur,
        displayName: val.fullName.trim(),
        username: val.username.trim(),
        jobTitle: val.jobTitle?.trim() || undefined,
        phone: val.phone?.trim() || undefined,
        avatarUrl: this.avatarPreview() || undefined,
      };
      // Chỉ phát sự kiện; thông báo thành công/thất bại do trang cha báo SAU KHI
      // backend trả lời. Báo "thành công" ngay tại đây là nói dối khi lưu hỏng.
      this.saveProfile.emit(updated);
      this.profileForm.markAsPristine();
    }
  }

  /**
   * Đổi mật khẩu — GỌI FIREBASE THẬT rồi mới báo kết quả.
   *
   * Gọi thẳng `AuthService` như `updateProfile` ở trên, thay vì bắn output cho
   * trang cha: có kết quả ngay tại chỗ nên mới biết lúc nào được phép xoá form.
   * Bản trước xoá form ngay khi bấm — nhập sai mật khẩu hiện tại là mất trắng
   * cả ba ô, phải gõ lại từ đầu.
   */
  async onSubmitPassword(): Promise<void> {
    if (this.passwordForm.invalid || this.savingPassword()) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    this.savingPassword.set(true);
    try {
      await this.authService.changePassword(currentPassword, newPassword);
      this.passwordForm.reset();
      this.flashMessage.emit({ message: 'Password changed. Use it the next time you sign in.', type: 'success' });
    } catch (err) {
      this.flashMessage.emit({ message: this.describePasswordError(err), type: 'error' });
    } finally {
      this.savingPassword.set(false);
    }
  }

  /** Mã lỗi của Firebase dịch sang câu người dùng hiểu và biết phải làm gì. */
  private describePasswordError(err: unknown): string {
    const code = (err as { code?: string })?.code ?? '';
    switch (code) {
      // Firebase gộp "sai mật khẩu" và "không có tài khoản" vào cùng một mã để
      // người ngoài không dò được email nào có thật.
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Your current password is incorrect.';
      case 'auth/weak-password':
        return 'Firebase rejected this password as too weak.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a few minutes and try again.';
      case 'auth/requires-recent-login':
        return 'For your security, please sign out and sign in again, then change your password.';
      case 'auth/network-request-failed':
        return "Couldn't reach the server. Please check your connection.";
      default:
        return (err as { message?: string })?.message ?? 'Failed to change the password.';
    }
  }
}
