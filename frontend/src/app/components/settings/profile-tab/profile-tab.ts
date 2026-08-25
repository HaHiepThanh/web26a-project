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

/** Confirms the two password fields match; attached at the FormGroup level. */
function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const newPassword = group.get('newPassword')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  if (!newPassword || !confirmPassword) return null;
  return newPassword === confirmPassword ? null : { passwordMismatch: true };
}

interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  percent: number;
  colorVar: string;
}

/** Simple heuristic strength meter — length + character-class variety. */
function computePasswordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: '', percent: 0, colorVar: '#94a3b8' };

  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score++;

  const clamped = Math.min(score, 4) as PasswordStrength['score'];
  const table: Record<number, { label: string; colorVar: string }> = {
    0: { label: 'Very weak', colorVar: '#ef4444' },
    1: { label: 'Weak', colorVar: '#f97316' },
    2: { label: 'Fair', colorVar: '#eab308' },
    3: { label: 'Strong', colorVar: '#22c55e' },
    4: { label: 'Very strong', colorVar: '#10b981' },
  };

  return { score: clamped, percent: (clamped / 4) * 100, ...table[clamped] };
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
  readonly changePassword = output<{ currentPassword: string; newPassword: string }>();
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
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatchValidator },
  );

  get passwordStrength(): PasswordStrength {
    return computePasswordStrength(this.passwordForm.get('newPassword')?.value ?? '');
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

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    }).catch(() => null);
    if (!dataUrl) {
      this.flashMessage.emit({ message: "Couldn't read this image, please try another one.", type: 'error' });
      return;
    }

    const previous = this.avatarPreview();
    this.avatarPreview.set(dataUrl); // xem trước ngay, nhưng chỉ là tạm — có thể phải trả lại bên dưới
    this.savingAvatar.set(true);
    try {
      await this.authService.updateProfile({ avatarUrl: dataUrl });
      this.flashMessage.emit({ message: 'Avatar updated.', type: 'success' });
      this.profileChanged.emit();
    } catch (err) {
      this.avatarPreview.set(previous); // lưu hỏng → trả preview về đúng ảnh đang có trên server
      this.flashMessage.emit({ message: this.describeProfileError(err, 'Failed to update avatar.'), type: 'error' });
    } finally {
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

  onSubmitPassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    this.changePassword.emit({ currentPassword, newPassword });
    this.passwordForm.reset();
  }
}
