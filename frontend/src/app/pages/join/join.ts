import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LucideBuilding2,
  LucideCircleCheck,
  LucideUnlink,
  LucideTriangleAlert,
} from '@lucide/angular';
import { AuthService } from '../../services/auth.service';
import { InviteLinkStore } from '../../ngrx/invite-link/invite-link.store';
import { OrganizationStore } from '../../ngrx/organization/organization.store';

/**
 * Màn "Bạn được mời vào ..." khi bấm một link mời.
 *
 * Đặt NGOÀI app-layout (giống /onboarding) là bắt buộc, không phải lựa chọn:
 * người bấm link có thể chưa thuộc tổ chức nào, mà `onboardingGuard` của layout
 * app sẽ đá thẳng họ sang /onboarding trước khi trang này kịp chạy — đúng lúc họ
 * đang cầm trên tay lời mời vào một tổ chức.
 */
@Component({
  selector: 'app-join',
  imports: [LucideBuilding2, LucideCircleCheck, LucideUnlink, LucideTriangleAlert],
  templateUrl: './join.html',
  host: { class: 'block min-h-screen bg-base-200' },
})
export class Join {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly links = inject(InviteLinkStore);
  private readonly organizations = inject(OrganizationStore);

  readonly token = signal('');
  readonly preview = this.links.preview;
  readonly accepting = this.links.accepting;
  readonly lastError = this.links.lastError;

  /** Tách ra để template khỏi lặp `preview().kind === 'ready'` ở mọi chỗ. */
  readonly ready = computed(() => {
    const p = this.preview();
    return p.kind === 'ready' ? p.preview : null;
  });

  readonly deadMessage = computed(() => {
    const p = this.preview();
    return p.kind === 'gone' || p.kind === 'invalid' ? p.message : null;
  });

  /** `gone` được nói rõ là "xin link mới", `invalid` thì không — link sai thì xin cũng vô ích. */
  readonly canAskForNewLink = computed(() => this.preview().kind === 'gone');

  constructor() {
    effect(() => {
      const token = this.route.snapshot.paramMap.get('token') ?? '';
      this.token.set(token);

      if (!token) {
        void this.router.navigateByUrl('/not-found');
        return;
      }

      // Chưa đăng nhập: nhớ đường quay lại rồi mới đá sang /login. Không nhớ thì
      // người dùng đăng nhập xong rơi vào /workspace và mất hẳn lời mời.
      if (!this.auth.currentUser()) {
        void this.router.navigate(['/login'], {
          queryParams: { returnUrl: `/join/${token}` },
        });
        return;
      }

      void this.load(token);
    });
  }

  private async load(token: string): Promise<void> {
    await this.links.loadPreview(token);

    // Đã là thành viên thì vào thẳng, không hỏi "Tham gia?" nữa. Bấm cũng không
    // tiêu lượt (backend đã lo), nhưng hỏi thừa là khó hiểu.
    const p = this.preview();
    if (p.kind === 'ready' && p.preview.alreadyMember) {
      void this.router.navigateByUrl(`/${p.preview.orgSlug}/workspace`);
    }
  }

  async onJoin(): Promise<void> {
    const token = this.token();
    if (!token || this.accepting()) return;

    const res = await this.links.acceptLink(token);
    if (!res) return; // store đã chuyển `preview` sang 'gone' hoặc ghi lastError

    // Vừa vào tổ chức mới thì danh sách tổ chức đang giữ trong bộ nhớ đã cũ —
    // không nạp lại là sidebar thiếu đúng cái tổ chức họ vừa tham gia.
    await this.organizations.reload();
    void this.router.navigateByUrl(`/${res.orgSlug}/workspace`);
  }

  goHome(): void {
    void this.router.navigateByUrl('/workspace');
  }

  /** Nhãn quyền cho người đọc, không phải mã trong database. */
  roleLabel(role: 'admin' | 'member'): string {
    return role === 'admin' ? 'Admin' : 'Member';
  }

  /** Ngày hết hạn dạng đọc được. Chỉ để hiển thị — không dùng để quyết định gì. */
  expiryLabel(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
  }
}
