import { Component, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Toast, ToastType } from '../../models';

@Component({
  selector: 'app-forgot-password',
  imports: [FormsModule, RouterLink],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.css',
})
export class ForgotPassword implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  email = '';
  readonly loading = signal(false);
  readonly sent = signal(false);
  readonly cooldown = signal(0);
  readonly toasts = signal<Toast[]>([]);

  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const prefillEmail = this.route.snapshot.queryParamMap.get('email');
    if (prefillEmail) {
      this.email = prefillEmail;
    }
  }

  ngOnDestroy(): void {
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer);
    }
  }

  addToast(message: string, type: ToastType = 'info'): void {
    const id = Date.now();
    this.toasts.update((t) => [...t, { id, message, type }]);
    setTimeout(() => this.removeToast(id), 5000);
  }

  removeToast(id: number): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }

  private startCooldown(): void {
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
    this.cooldown.set(60);
    this.cooldownTimer = setInterval(() => {
      const current = this.cooldown();
      if (current <= 1) {
        this.cooldown.set(0);
        if (this.cooldownTimer) {
          clearInterval(this.cooldownTimer);
          this.cooldownTimer = null;
        }
      } else {
        this.cooldown.set(current - 1);
      }
    }, 1000);
  }

  async onSubmit(): Promise<void> {
    const targetEmail = this.email.trim();
    if (!targetEmail) {
      this.addToast('Please enter your email address.', 'error');
      return;
    }
    if (!targetEmail.includes('@')) {
      this.addToast('Please enter a valid email address.', 'error');
      return;
    }

    this.loading.set(true);
    try {
      await this.auth.sendPasswordReset(targetEmail);
      this.sent.set(true);
      this.startCooldown();
      this.addToast('Password reset link sent to your email!', 'success');
    } catch (err) {
      this.addToast(this.describeError(err), 'error');
    } finally {
      this.loading.set(false);
    }
  }

  async onResend(): Promise<void> {
    if (this.cooldown() > 0 || this.loading()) return;
    await this.onSubmit();
  }

  private describeError(err: unknown): string {
    const code = (err as { code?: string })?.code ?? '';
    switch (code) {
      case 'auth/user-not-found':
      case 'auth/invalid-credential':
        return 'No account found with this email.';
      case 'auth/invalid-email':
        return 'Invalid email format.';
      case 'auth/too-many-requests':
        return 'Too many reset requests. Please wait a few minutes before trying again.';
      case 'auth/network-request-failed':
        return "Network error. Please check your connection.";
      default:
        return (err as { message?: string })?.message ?? 'Failed to send password reset email.';
    }
  }
}
