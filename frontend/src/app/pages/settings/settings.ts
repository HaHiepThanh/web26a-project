import { DOCUMENT } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
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
import { ThemeService } from '../../services/theme.service';
import {
  ACCENT_COLORS,
  ApiToken,
  DeviceSession,
  Integration,
  LANGUAGE_OPTIONS,
  Member,
  MemberRole,
  NAV_ITEMS,
  NotificationRule,
  PlanOption,
  SettingsTab,
  TIMEZONE_OPTIONS,
  mockApiTokens,
  mockIntegrations,
  mockMembers,
  mockNotificationRules,
  mockPlans,
  mockSessions,
} from './settings.models';

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
  if (!password) return { score: 0, label: '', percent: 0, colorVar: 'var(--border-strong)' };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const clamped = Math.min(score, 4) as PasswordStrength['score'];
  const table: Record<number, { label: string; colorVar: string }> = {
    0: { label: 'Rất yếu', colorVar: 'var(--danger)' },
    1: { label: 'Yếu', colorVar: 'var(--danger)' },
    2: { label: 'Trung bình', colorVar: 'var(--warning)' },
    3: { label: 'Mạnh', colorVar: 'var(--success)' },
    4: { label: 'Rất mạnh', colorVar: 'var(--success)' },
  };

  return { score: clamped, percent: (clamped / 4) * 100, ...table[clamped] };
}

/**
 * Trang Cài đặt (ported từ Demo_setting — SettingsComponent).
 * Tab Giao diện dùng ThemeService thật của app (chỉ Light/Dark — dự án không
 * có chế độ "System"). Các tab còn lại (Notifications/Workspace-members/
 * Billing/Integrations) chưa có module backend tương ứng nên vẫn giữ dữ liệu
 * mock cục bộ như bản gốc, không gọi API.
 */
@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, FormsModule, RouterLink, RouterLinkActive],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings {
  private readonly fb = inject(FormBuilder);
  private readonly document = inject(DOCUMENT);
  private readonly auth = inject(AuthService);
  readonly themeService = inject(ThemeService);

  // ---------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------
  readonly navItems = NAV_ITEMS;
  readonly activeTab = signal<SettingsTab>('profile');

  onTabChange(tab: SettingsTab): void {
    this.activeTab.set(tab);
  }

  // ---------------------------------------------------------------------
  // Toast / inline save feedback
  // ---------------------------------------------------------------------
  readonly toastMessage = signal<string | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  private flash(message: string): void {
    this.toastMessage.set(message);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastMessage.set(null), 2600);
  }

  // ---------------------------------------------------------------------
  // Tab 1 — Profile
  // ---------------------------------------------------------------------
  readonly languageOptions = LANGUAGE_OPTIONS;
  readonly timezoneOptions = TIMEZONE_OPTIONS;
  readonly emailVerified = signal(true);
  readonly avatarPreview = signal<string | null>(null);

  readonly profileForm: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    username: ['', [Validators.required, Validators.pattern(/^[a-z0-9_.]{3,20}$/)]],
    jobTitle: [''],
    email: [{ value: '', disabled: true }],
    phone: ['', [Validators.pattern(/^\+?[0-9 ]{9,15}$/)]],
    language: ['vi', [Validators.required]],
    timezone: ['UTC+7', [Validators.required]],
  });

  constructor() {
    const user = this.auth.currentUser();
    this.avatarPreview.set(user?.avatarUrl ?? null);
    this.profileForm.patchValue({
      fullName: user?.displayName ?? '',
      username: (user?.email ?? '').split('@')[0] || '',
      email: user?.email ?? '',
    });
  }

  onUploadAvatar(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => this.avatarPreview.set(reader.result as string);
    reader.readAsDataURL(file);
    input.value = '';
  }

  onRemoveAvatar(): void {
    this.avatarPreview.set(null);
  }

  onSaveProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    this.profileForm.markAsPristine();
    this.flash('Đã lưu thông tin cá nhân.');
  }

  // ---------------------------------------------------------------------
  // Tab 2 — Notifications (mock — chưa có module backend)
  // ---------------------------------------------------------------------
  readonly emailNotifications = signal(true);
  readonly pushNotifications = signal(true);
  readonly notificationRules = signal<NotificationRule[]>(mockNotificationRules());
  readonly dueDateLeadTime = signal<'1h' | '1d'>('1d');

  readonly quietHoursEnabled = signal(false);
  readonly quietHoursForm: FormGroup = this.fb.group({
    from: ['18:00'],
    to: ['08:00'],
  });

  toggleEmailChannel(): void {
    this.emailNotifications.update((v) => !v);
  }

  togglePushChannel(): void {
    this.pushNotifications.update((v) => !v);
  }

  toggleNotificationCell(key: string, channel: 'email' | 'push'): void {
    this.notificationRules.update((rules) =>
      rules.map((rule) => (rule.key === key ? { ...rule, [channel]: !rule[channel] } : rule)),
    );
  }

  setDueDateLeadTime(value: '1h' | '1d'): void {
    this.dueDateLeadTime.set(value);
  }

  toggleQuietHours(): void {
    this.quietHoursEnabled.update((v) => !v);
  }

  onSaveNotifications(): void {
    this.flash('Đã lưu tuỳ chọn thông báo.');
  }

  // ---------------------------------------------------------------------
  // Tab 3 — Workspace (mock — trang /members riêng mới nối với tenant thật)
  // ---------------------------------------------------------------------
  readonly workspaceLogo = signal<string | null>(null);
  readonly workspaceBrandColor = signal('#6366f1');

  readonly workspaceForm: FormGroup = this.fb.group({
    name: ['Team Thanh Project', [Validators.required]],
    slug: ['team-thanh-project', [Validators.required, Validators.pattern(/^[a-z0-9-]{3,40}$/)]],
    description: ['Không gian làm việc quản lý dự án & công việc cho đội ngũ.', [Validators.maxLength(240)]],
  });

  readonly members = signal<Member[]>(mockMembers());
  readonly memberRoles: MemberRole[] = ['Admin', 'Member', 'Guest'];

  readonly showInviteModal = signal(false);
  readonly inviteForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    role: ['Member', [Validators.required]],
  });

  onUploadWorkspaceLogo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => this.workspaceLogo.set(reader.result as string);
    reader.readAsDataURL(file);
    input.value = '';
  }

  onSaveWorkspace(): void {
    if (this.workspaceForm.invalid) {
      this.workspaceForm.markAllAsTouched();
      return;
    }
    this.workspaceForm.markAsPristine();
    this.flash('Đã cập nhật thông tin workspace.');
  }

  openInviteModal(): void {
    this.inviteForm.reset({ email: '', role: 'Member' });
    this.showInviteModal.set(true);
  }

  closeInviteModal(): void {
    this.showInviteModal.set(false);
  }

  onSendInvite(): void {
    if (this.inviteForm.invalid) {
      this.inviteForm.markAllAsTouched();
      return;
    }
    const { email, role } = this.inviteForm.getRawValue();
    const newMember: Member = {
      id: `u${Date.now()}`,
      name: email.split('@')[0],
      email,
      avatarUrl: `https://i.pravatar.cc/100?u=${encodeURIComponent(email)}`,
      role,
      status: 'active',
      joinedAt: new Date().toISOString().slice(0, 10),
    };
    this.members.update((list) => [newMember, ...list]);
    this.closeInviteModal();
    this.flash(`Đã gửi lời mời tới ${email}.`);
  }

  onChangeRole(member: Member, role: MemberRole): void {
    this.members.update((list) => list.map((m) => (m.id === member.id ? { ...m, role } : m)));
  }

  onToggleFreeze(member: Member): void {
    this.members.update((list) =>
      list.map((m) => (m.id === member.id ? { ...m, status: m.status === 'active' ? 'frozen' : 'active' } : m)),
    );
  }

  onRemoveMember(member: Member): void {
    if (member.role === 'Owner') return;
    const confirmed = this.document.defaultView?.confirm(
      `Xoá ${member.name} khỏi workspace? Hành động này không thể hoàn tác.`,
    );
    if (!confirmed) return;
    this.members.update((list) => list.filter((m) => m.id !== member.id));
    this.flash(`Đã xoá ${member.name} khỏi workspace.`);
  }

  // ---------------------------------------------------------------------
  // Tab 4 — Appearance (theme = ThemeService thật; accent color = local)
  // ---------------------------------------------------------------------
  readonly accentColors = ACCENT_COLORS;
  readonly accentColor = signal<string>(localStorage.getItem('settings.accent') ?? '#6366f1');

  private readonly syncAccentColor = effect(() => {
    const color = this.accentColor();
    localStorage.setItem('settings.accent', color);
    this.document.documentElement.style.setProperty('--accent', color);
  });

  setAccentColor(color: string): void {
    this.accentColor.set(color);
  }

  // ---------------------------------------------------------------------
  // Tab 4 — Security
  // ---------------------------------------------------------------------
  readonly passwordForm: FormGroup = this.fb.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatchValidator },
  );

  get passwordStrength(): PasswordStrength {
    return computePasswordStrength(this.passwordForm.get('newPassword')?.value ?? '');
  }

  onChangePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.passwordForm.reset();
    this.flash('Đã đổi mật khẩu thành công.');
  }

  readonly twoFAEnabled = signal(false);
  readonly twoFASetupOpen = signal(false);
  readonly twoFAQrSeed = signal('otpauth://totp/TeamThanh:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=TeamThanh');

  openTwoFASetup(): void {
    this.twoFASetupOpen.set(true);
  }

  closeTwoFASetup(): void {
    this.twoFASetupOpen.set(false);
  }

  confirmTwoFA(): void {
    this.twoFAEnabled.set(true);
    this.twoFASetupOpen.set(false);
    this.flash('Đã kích hoạt xác thực 2 lớp.');
  }

  disableTwoFA(): void {
    const confirmed = this.document.defaultView?.confirm('Tắt xác thực 2 lớp? Tài khoản của bạn sẽ kém an toàn hơn.');
    if (!confirmed) return;
    this.twoFAEnabled.set(false);
    this.flash('Đã tắt xác thực 2 lớp.');
  }

  readonly sessions = signal<DeviceSession[]>(mockSessions());

  onRevokeSession(session: DeviceSession): void {
    if (session.current) return;
    this.sessions.update((list) => list.filter((s) => s.id !== session.id));
  }

  onLogoutAllOtherSessions(): void {
    this.sessions.update((list) => list.filter((s) => s.current));
    this.flash('Đã đăng xuất khỏi tất cả thiết bị khác.');
  }

  // ---------------------------------------------------------------------
  // Tab 5 — Billing & Plan (mock — chưa có module backend)
  // ---------------------------------------------------------------------
  readonly currentPlan = signal<PlanOption['id']>('free');
  readonly plans = signal<PlanOption[]>(mockPlans('free'));

  readonly usage = {
    storageUsedGB: 3.2,
    storageLimitGB: 5,
    boardsUsed: 2,
    boardsLimit: 3,
    membersUsed: 5,
    membersLimit: 10,
  };

  usagePercent(used: number, limit: number): number {
    return Math.min(100, Math.round((used / limit) * 100));
  }

  onUpgradePlan(planId: PlanOption['id']): void {
    if (planId === this.currentPlan()) return;
    this.currentPlan.set(planId);
    this.plans.set(mockPlans(planId));
    this.flash(`Đã chuyển sang gói ${planId.toUpperCase()}. (mô phỏng — chưa thanh toán thật)`);
  }

  // ---------------------------------------------------------------------
  // Tab 6 — Integrations & API (mock — chưa có module backend)
  // ---------------------------------------------------------------------
  readonly integrations = signal<Integration[]>(mockIntegrations());
  readonly apiTokens = signal<ApiToken[]>(mockApiTokens());

  readonly showNewTokenModal = signal(false);
  readonly newTokenName = signal('');
  readonly generatedToken = signal<string | null>(null);

  toggleIntegration(integration: Integration): void {
    this.integrations.update((list) =>
      list.map((i) => (i.id === integration.id ? { ...i, connected: !i.connected } : i)),
    );
    this.flash(`${integration.connected ? 'Đã ngắt kết nối' : 'Đã kết nối'} ${integration.name}.`);
  }

  openNewTokenModal(): void {
    this.newTokenName.set('');
    this.generatedToken.set(null);
    this.showNewTokenModal.set(true);
  }

  closeNewTokenModal(): void {
    this.showNewTokenModal.set(false);
  }

  generateToken(): void {
    if (!this.newTokenName().trim()) return;
    const raw = `pk_live_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
    this.generatedToken.set(raw);
    this.apiTokens.update((list) => [
      {
        id: `t${Date.now()}`,
        name: this.newTokenName().trim(),
        tokenPreview: `${raw.slice(0, 12)}...${raw.slice(-4)}`,
        createdAt: new Date().toISOString().slice(0, 10),
        lastUsedAt: null,
      },
      ...list,
    ]);
  }

  onRevokeToken(token: ApiToken): void {
    this.apiTokens.update((list) => list.filter((t) => t.id !== token.id));
    this.flash(`Đã thu hồi token "${token.name}".`);
  }

  async copyToClipboard(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.flash('Đã sao chép vào bộ nhớ tạm.');
    } catch {
      this.flash('Không thể sao chép tự động — vui lòng copy thủ công.');
    }
  }

  // ---------------------------------------------------------------------
  // trackBy helpers
  // ---------------------------------------------------------------------
  trackByMemberId = (_: number, item: Member) => item.id;
  trackBySessionId = (_: number, item: DeviceSession) => item.id;
  trackByIntegrationId = (_: number, item: Integration) => item.id;
  trackByTokenId = (_: number, item: ApiToken) => item.id;
  trackByRuleKey = (_: number, item: NotificationRule) => item.key;
  trackByPlanId = (_: number, item: PlanOption) => item.id;
}
