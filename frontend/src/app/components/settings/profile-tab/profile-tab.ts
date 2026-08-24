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

  readonly currentUser = input<User | null>(null);

  readonly saveProfile = output<User>();
  readonly changePassword = output<{ currentPassword: string; newPassword: string }>();
  readonly flashMessage = output<{ message: string; type?: 'success' | 'error' | 'info' }>();

  readonly initialsOf = initialsOf;
  readonly avatarPreview = signal<string | null>(null);
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

  onUploadAvatar(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      this.avatarPreview.set(dataUrl);
      const user = this.currentUser();
      if (user) {
        this.saveProfile.emit({ ...user, avatarUrl: dataUrl });
      }
      this.flashMessage.emit({ message: 'Avatar updated.', type: 'success' });
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  onRemoveAvatar(): void {
    this.avatarPreview.set(null);
    const user = this.currentUser();
    if (user) {
      this.saveProfile.emit({ ...user, avatarUrl: '' });
    }
    this.flashMessage.emit({ message: 'Avatar removed.', type: 'info' });
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
