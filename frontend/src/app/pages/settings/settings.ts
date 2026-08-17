import { Component, computed, effect, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models';
import {
  LANGUAGE_OPTIONS,
  NAV_ITEMS,
  SettingsTab,
  TIMEZONE_OPTIONS,
} from './settings.models';
import {
  WorkspaceItem,
  WorkspaceMember,
  avatarBgFor,
  initialsOf,
  loadStoredWorkspaces,
  persistWorkspaces,
} from '../../mocks';

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
    0: { label: 'Rất yếu', colorVar: '#ef4444' },
    1: { label: 'Yếu', colorVar: '#f97316' },
    2: { label: 'Trung bình', colorVar: '#eab308' },
    3: { label: 'Mạnh', colorVar: '#22c55e' },
    4: { label: 'Rất mạnh', colorVar: '#10b981' },
  };

  return { score: clamped, percent: (clamped / 4) * 100, ...table[clamped] };
}

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, FormsModule],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings {
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);

  readonly initialsOf = initialsOf;
  readonly avatarBgFor = avatarBgFor;

  // ---------------------------------------------------------------------
  // Navigation: Only Profile & Manage Workspace
  // ---------------------------------------------------------------------
  readonly navItems = NAV_ITEMS;
  readonly activeTab = signal<SettingsTab>('profile');

  onTabChange(tab: SettingsTab): void {
    this.activeTab.set(tab);
  }

  // ---------------------------------------------------------------------
  // Toast notifications
  // ---------------------------------------------------------------------
  readonly toastMessage = signal<string | null>(null);
  readonly toastType = signal<'success' | 'error' | 'info'>('success');
  private toastTimer?: ReturnType<typeof setTimeout>;

  private flash(message: string, type: 'success' | 'error' | 'info' = 'success'): void {
    this.toastMessage.set(message);
    this.toastType.set(type);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastMessage.set(null), 3000);
  }

  // ---------------------------------------------------------------------
  // TAB 1: Trang cá nhân (Profile)
  // ---------------------------------------------------------------------
  readonly languageOptions = LANGUAGE_OPTIONS;
  readonly timezoneOptions = TIMEZONE_OPTIONS;
  readonly emailVerified = signal(true);
  readonly avatarPreview = signal<string | null>(null);
  readonly copiedUuid = signal(false);

  readonly profileForm: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    username: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9_.]{3,25}$/)]],
    jobTitle: [''],
    email: [{ value: '', disabled: true }],
    phone: ['', [Validators.pattern(/^(0|\+84)[0-9]{9,10}$/)]],
    language: ['vi', [Validators.required]],
    timezone: ['UTC+7', [Validators.required]],
  });

  // Password change form (Old password verification)
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
    const user = this.auth.currentUser();
    this.avatarPreview.set(user?.avatarUrl ?? null);
    this.profileForm.patchValue({
      fullName: user?.displayName ?? '',
      username: user?.username ?? (user?.email ? user.email.split('@')[0] : ''),
      jobTitle: user?.jobTitle ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      language: user?.language ?? 'vi',
      timezone: user?.timezone ?? 'UTC+7',
    });

    // Load initial workspaces
    this.workspaces.set(loadStoredWorkspaces());
    if (this.workspaces().length > 0) {
      this.selectedWorkspaceId.set(this.workspaces()[0].id);
    }
  }

  onUploadAvatar(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      this.avatarPreview.set(dataUrl);
      const user = this.auth.currentUser();
      if (user) {
        this.auth.setUser({ ...user, avatarUrl: dataUrl });
      }
      this.flash('Đã cập nhật ảnh đại diện mới.');
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  onRemoveAvatar(): void {
    this.avatarPreview.set(null);
    const user = this.auth.currentUser();
    if (user) {
      this.auth.setUser({ ...user, avatarUrl: '' });
    }
    this.flash('Đã gỡ bỏ ảnh đại diện.');
  }

  copyUuid(): void {
    const uuid = this.auth.currentUser()?.id;
    if (!uuid) return;
    navigator.clipboard.writeText(uuid).then(() => {
      this.copiedUuid.set(true);
      setTimeout(() => this.copiedUuid.set(false), 2000);
      this.flash('Đã sao chép mã UUID cá nhân.');
    });
  }

  onSaveProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      this.flash('Vui lòng kiểm tra lại thông tin biểu mẫu.', 'error');
      return;
    }

    const val = this.profileForm.getRawValue();
    const cur = this.auth.currentUser();
    if (cur) {
      const updated: User = {
        ...cur,
        displayName: val.fullName.trim(),
        username: val.username.trim(),
        jobTitle: val.jobTitle?.trim() || undefined,
        phone: val.phone?.trim() || undefined,
        language: val.language,
        timezone: val.timezone,
        avatarUrl: this.avatarPreview() || undefined,
      };
      this.auth.setUser(updated);
      this.profileForm.markAsPristine();
      this.flash('Đã cập nhật thông tin cá nhân thành công!');
    }
  }

  onChangePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    const curUser = this.auth.currentUser();

    // Verify old password
    if (curUser?.password && curUser.password !== currentPassword) {
      this.flash('Mật khẩu hiện tại không chính xác. Vui lòng thử lại!', 'error');
      return;
    }

    if (curUser) {
      this.auth.setUser({ ...curUser, password: newPassword });
    }

    this.passwordForm.reset();
    this.flash('Đã đổi mật khẩu thành công!');
  }

  // ---------------------------------------------------------------------
  // TAB 2: Manage Workspace (Quản lý các thành viên trong workspace của mình)
  // ---------------------------------------------------------------------
  readonly workspaces = signal<WorkspaceItem[]>([]);
  readonly selectedWorkspaceId = signal<string | null>(null);

  readonly selectedWorkspace = computed(() => {
    const id = this.selectedWorkspaceId();
    return this.workspaces().find((w) => w.id === id) || this.workspaces()[0] || null;
  });

  // Add member modal state
  readonly showAddMemberModal = signal(false);
  readonly memberSearchQuery = signal('');
  readonly memberRoleSelect = signal<'member' | 'owner'>('member');
  readonly selectedUserToAdd = signal<User | null>(null);

  readonly searchCandidateUsers = computed(() => {
    const q = this.memberSearchQuery().trim().toLowerCase();
    const allUsers = this.auth.getSearchableUsers();
    const currentMemberIds = new Set(this.selectedWorkspace()?.members.map((m) => m.id.toLowerCase()) || []);

    return allUsers.filter((u) => {
      if (currentMemberIds.has(u.id.toLowerCase())) return false;
      if (!q) return true;
      return (
        u.id.toLowerCase().includes(q) ||
        (u.displayName && u.displayName.toLowerCase().includes(q)) ||
        u.email.toLowerCase().includes(q)
      );
    });
  });

  selectWorkspace(id: string): void {
    this.selectedWorkspaceId.set(id);
  }

  openAddMember(): void {
    this.memberSearchQuery.set('');
    this.selectedUserToAdd.set(null);
    this.memberRoleSelect.set('member');
    this.showAddMemberModal.set(true);
  }

  closeAddMember(): void {
    this.showAddMemberModal.set(false);
  }

  chooseUserToAdd(user: User): void {
    this.selectedUserToAdd.set(user);
    this.memberSearchQuery.set(user.displayName || user.email);
  }

  confirmAddMember(): void {
    const ws = this.selectedWorkspace();
    const user = this.selectedUserToAdd();
    if (!ws || !user) {
      this.flash('Vui lòng chọn một người dùng để thêm.', 'error');
      return;
    }

    const newMember: WorkspaceMember = {
      id: user.id,
      displayName: user.displayName || user.email.split('@')[0],
      email: user.email,
      role: this.memberRoleSelect(),
      avatarUrl: user.avatarUrl,
    };

    const updatedWorkspaces = this.workspaces().map((w) => {
      if (w.id === ws.id) {
        const members = [...w.members, newMember];
        return { ...w, members, membersCount: members.length };
      }
      return w;
    });

    this.workspaces.set(updatedWorkspaces);
    persistWorkspaces(updatedWorkspaces);
    this.closeAddMember();
    this.flash(`Đã thêm ${newMember.displayName} vào Workspace.`);
  }

  changeMemberRole(memberId: string, newRole: 'owner' | 'member'): void {
    const ws = this.selectedWorkspace();
    if (!ws) return;

    const updatedWorkspaces = this.workspaces().map((w) => {
      if (w.id === ws.id) {
        const members = w.members.map((m) => (m.id === memberId ? { ...m, role: newRole } : m));
        return { ...w, members };
      }
      return w;
    });

    this.workspaces.set(updatedWorkspaces);
    persistWorkspaces(updatedWorkspaces);
    this.flash('Đã cập nhật vai trò thành viên.');
  }

  removeMember(member: WorkspaceMember): void {
    const ws = this.selectedWorkspace();
    if (!ws) return;

    if (member.role === 'owner' && ws.members.filter((m) => m.role === 'owner').length <= 1) {
      this.flash('Workspace phải có ít nhất 1 Trưởng nhóm (Owner).', 'error');
      return;
    }

    const updatedWorkspaces = this.workspaces().map((w) => {
      if (w.id === ws.id) {
        const members = w.members.filter((m) => m.id !== member.id);
        return { ...w, members, membersCount: members.length };
      }
      return w;
    });

    this.workspaces.set(updatedWorkspaces);
    persistWorkspaces(updatedWorkspaces);
    this.flash(`Đã xóa ${member.displayName} khỏi Workspace.`);
  }
}
