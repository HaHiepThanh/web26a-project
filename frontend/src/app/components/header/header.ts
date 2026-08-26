import { Component, DestroyRef, ElementRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  LucideBell,
  LucideChevronDown,
  LucideCopy,
  LucideFolderKanban,
  LucideKanban,
  LucideKeyRound,
  LucideLogOut,
  LucideMoon,
  LucidePlus,
  LucideSearch,
  LucideSettings,
  LucideSun,
  LucideUser,
  LucideUserPlus,
  LucideCheck,
  LucideX,
} from '@lucide/angular';
import { AppNotification, BoardSearchResult } from '../../models';
import { AuthService } from '../../services/auth.service';
import { HeaderActionsService } from '../../services/header-actions.service';
import { RealtimeService } from '../../services/realtime.service';
import { InvitesPanel } from '../shared/invites-panel/invites-panel';
import { NotificationsPanel } from '../shared/notifications-panel/notifications-panel';

/** Dải nhắc "có lời mời mới" tự tắt sau ngần này. */
const INVITE_TOAST_MS = 6000;

/**
 * Thanh trên cùng, dùng chung cho mọi trang bên trong app-layout.
 *
 * Từ `lg` trở xuống, header chỉ còn logo và ô người dùng; ô tìm kiếm, nút tạo
 * nhanh, chuông, lời mời, đổi giao diện và cài đặt chuyển hết xuống
 * `app-mobile-action-bar` ở đáy màn hình. Phần hành vi dùng chung của hai thanh
 * nằm trong `HeaderActionsService` để không phải viết hai lần.
 */
@Component({
  selector: 'app-header',
  imports: [
    RouterLink,
    LucideBell,
    LucideCheck,
    LucideChevronDown,
    LucideCopy,
    LucideFolderKanban,
    LucideKanban,
    LucideKeyRound,
    LucideLogOut,
    LucideMoon,
    LucidePlus,
    LucideSearch,
    LucideSettings,
    LucideSun,
    LucideUser,
    LucideUserPlus,
    LucideX,
    NotificationsPanel,
    InvitesPanel,
  ],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly realtime = inject(RealtimeService);

  /** Công khai cho template: hai bảng dùng chung đọc dữ liệu thẳng từ đây. */
  readonly actions = inject(HeaderActionsService);

  readonly currentUser = this.auth.currentUser;

  /* ---- Lối tắt cho template, trỏ thẳng vào service ---- */
  readonly theme = this.actions.theme;
  readonly canManage = this.actions.canManage;
  readonly bellTitle = this.actions.bellTitle;
  readonly bellBadgeCount = this.actions.bellBadgeCount;
  readonly pendingInviteCount = this.actions.pendingInviteCount;

  /* ---- Trạng thái đóng/mở: của riêng thanh này ---- */
  readonly menuOpen = signal(false);
  readonly createMenuOpen = signal(false);
  readonly inviteMenuOpen = signal(false);
  readonly notifyMenuOpen = signal(false);

  /** Lời mời vừa tới qua WebSocket — hiện dải nhắc ngay dưới chuông vài giây. */
  readonly inviteToast = signal<{ orgName: string; fromUserName: string } | null>(null);
  /** Chuông rung một nhịp khi có lời mời mới, để người dùng để ý. */
  readonly bellPulse = signal(false);
  readonly notifyPulse = signal(false);
  private inviteToastTimer: ReturnType<typeof setTimeout> | null = null;

  /** Lỗi khi trả lời lời mời (vd lời mời đã bị huỷ) — hiện ngay trong bảng. */
  readonly inviteError = signal<string | null>(null);

  constructor() {
    // Kết nối realtime mở ở App (gốc), không phải ở đây — xem app.ts.
    // Lời mời mới về → rung chuông + hiện dải nhắc, KHÔNG cần F5.
    effect(() => {
      const inv = this.realtime.newInvite();
      if (!inv) return;

      this.inviteToast.set({ orgName: inv.orgName, fromUserName: inv.fromUserName });
      this.bellPulse.set(false);
      setTimeout(() => this.bellPulse.set(true));

      // ⚠️ Huỷ hẹn giờ của toast TRƯỚC. Không có dòng này thì hai lời mời về
      //    cách nhau dưới 6 giây sẽ giẫm chân nhau: hẹn giờ của cái thứ nhất
      //    tắt luôn toast của cái thứ hai — người dùng thấy thông báo chớp qua
      //    rồi biến mất sau 2–3 giây.
      if (this.inviteToastTimer) clearTimeout(this.inviteToastTimer);
      this.inviteToastTimer = setTimeout(() => this.inviteToast.set(null), INVITE_TOAST_MS);
    });

    inject(DestroyRef).onDestroy(() => {
      if (this.inviteToastTimer) clearTimeout(this.inviteToastTimer);
    });
  }

  /** Ảnh Google thỉnh thoảng tải lỗi (bị giới hạn tần suất, hoặc user gỡ ảnh).
   *  Khi đó rơi về chữ cái đầu — vẫn hơn là hiện icon ảnh vỡ. */
  readonly avatarBroken = signal(false);

  onAvatarError(): void {
    this.avatarBroken.set(true);
  }

  readonly initials = computed(() => {
    const user = this.currentUser();
    const name = user?.displayName ?? user?.email ?? '?';
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '?';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  });

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.menuOpen.set(false);
      this.createMenuOpen.set(false);
      this.inviteMenuOpen.set(false);
      this.notifyMenuOpen.set(false);
      this.actions.closeSearchDropdown();
    }
  }

  toggleInviteMenu(): void {
    this.menuOpen.set(false);
    this.createMenuOpen.set(false);
    this.notifyMenuOpen.set(false);
    this.actions.closeSearchDropdown();
    this.inviteMenuOpen.update((v) => !v);
  }

  toggleNotifyMenu(): void {
    this.menuOpen.set(false);
    this.createMenuOpen.set(false);
    this.inviteMenuOpen.set(false);
    this.actions.closeSearchDropdown();
    this.notifyMenuOpen.update((v) => !v);
  }

  toggleUserMenu(): void {
    this.createMenuOpen.set(false);
    this.actions.closeSearchDropdown();
    this.menuOpen.update((v) => !v);
  }

  toggleCreateMenu(): void {
    this.menuOpen.set(false);
    this.actions.closeSearchDropdown();
    this.createMenuOpen.update((v) => !v);
  }

  markAllNotificationsRead(): void {
    this.actions.markAllNotificationsRead();
  }

  openNotification(n: AppNotification): void {
    this.notifyMenuOpen.set(false);
    this.actions.openNotification(n);
  }

  async acceptInvite(inviteId: string): Promise<void> {
    this.inviteError.set(await this.actions.acceptInvite(inviteId));
  }

  async declineInvite(inviteId: string): Promise<void> {
    this.inviteError.set(await this.actions.declineInvite(inviteId));
  }

  toggleTheme(): void {
    this.actions.toggleTheme();
  }

  onSearchInput(event: Event): void {
    this.actions.onSearchInput((event.target as HTMLInputElement).value);
  }

  onSearchFocus(): void {
    this.actions.onSearchFocus();
  }

  selectBoard(board: BoardSearchResult): void {
    this.actions.openBoard(board);
  }

  clearSearch(inputEl?: HTMLInputElement): void {
    if (inputEl) inputEl.value = '';
    this.actions.onSearchInput('');
  }

  requestCreateBoard(): void {
    this.createMenuOpen.set(false);
    this.actions.requestCreateBoard();
  }

  requestCreateWorkspace(): void {
    this.createMenuOpen.set(false);
    this.actions.requestCreateWorkspace();
  }

  readonly copiedUuid = signal(false);

  copyUuid(): void {
    const uid = this.currentUser()?.id;
    if (!uid) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(uid);
      this.copiedUuid.set(true);
      setTimeout(() => this.copiedUuid.set(false), 2500);
    }
  }

  async logout(): Promise<void> {
    this.menuOpen.set(false);
    await this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
