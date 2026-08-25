import { Component, DestroyRef, ElementRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
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
} from '@lucide/angular';
import { AppNotification } from '../../models';
import { relativeTimeFrom } from '../../utils/avatar.util';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';
import { WorkspaceUiService } from '../../services/workspace-ui.service';
import { CardStore } from '../../ngrx/card/card.store';
import { NotificationService } from '../../services/notification.service';
import { OrganizationStore } from '../../ngrx/organization/organization.store';
import { RealtimeService } from '../../services/realtime.service';

/** Dải nhắc "có lời mời mới" tự tắt sau ngần này. */
const INVITE_TOAST_MS = 6000;

/** Top navbar shared by every page inside app-layout (ported from trello-workspace prototype). */
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
  ],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  private readonly auth = inject(AuthService);
  private readonly themeService = inject(ThemeService);
  private readonly workspaceUi = inject(WorkspaceUiService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly cardService = inject(CardStore);
  private readonly orgService = inject(OrganizationStore);
  private readonly realtime = inject(RealtimeService);
  private readonly notificationService = inject(NotificationService);

  readonly currentUser = this.auth.currentUser;
  readonly theme = this.themeService.theme;
  readonly menuOpen = signal(false);
  readonly createMenuOpen = signal(false);
  readonly inviteMenuOpen = signal(false);
  readonly notifyMenuOpen = signal(false);


  readonly myInvites = this.orgService.myInvites;
  readonly pendingInviteCount = this.orgService.pendingInviteCount;

  /** Lời mời vừa tới qua WebSocket — hiện dải nhắc ngay dưới chuông vài giây. */
  readonly inviteToast = signal<{ orgName: string; fromUserName: string } | null>(null);
  /** Chuông rung một nhịp khi có lời mời mới, để người dùng để ý. */
  readonly bellPulse = signal(false);
  private inviteToastTimer: ReturnType<typeof setTimeout> | null = null;

  // ---- Chuông 🔔 thông báo cá nhân (được giao thẻ, nhắc hạn) ----
  readonly notifications = this.notificationService.items;
  readonly unreadNotifications = this.notificationService.unreadCount;
  readonly notifyPulse = signal(false);
  readonly relativeTimeFrom = relativeTimeFrom;

  /** Badge gộp: thông báo chưa đọc + số thẻ sắp/đã quá hạn. */
  readonly bellBadgeCount = computed(() => this.unreadNotifications() + this.dueBadgeCount());

  readonly bellTitle = computed(() => {
    const n = this.unreadNotifications();
    const due = this.dueBadgeCount();
    if (!n && !due) return 'Notifications';
    const phan: string[] = [];
    if (n) phan.push(`${n} unread notification(s)`);
    if (due) phan.push(`${due} card(s) due soon/overdue`);
    return phan.join(' · ');
  });

  /** Thành viên thường không tạo được workspace/board — ẩn mục trong menu "+ Tạo".
   *  Backend mới là nơi chặn thật (assertCanManage), đây chỉ cho gọn mắt. */
  readonly canManage = this.orgService.isAdminOrOwner;

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

  /** Nhắc hạn Mức 1 (#10): đếm thẻ của "tôi" quá hạn/sắp đến hạn ở board vừa mở gần
   *  nhất (CardStore là singleton `providedIn: 'root'`, còn dữ liệu ngay cả khi rời board qua trang khác). */
  readonly dueBadgeCount = computed(() => {
    const c = this.cardService.myDueCounts();
    return c.overdue + c.dueSoon;
  });

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
    }
  }

  toggleInviteMenu(): void {
    this.menuOpen.set(false);
    this.createMenuOpen.set(false);
    this.notifyMenuOpen.set(false);
    this.inviteMenuOpen.update((v) => !v);
  }

  toggleNotifyMenu(): void {
    this.menuOpen.set(false);
    this.createMenuOpen.set(false);
    this.inviteMenuOpen.set(false);
    this.notifyMenuOpen.update((v) => !v);
  }

  markAllNotificationsRead(): void {
    this.notificationService.markAllRead();
  }

  /** Bấm 1 thông báo → đánh dấu đã đọc rồi đi thẳng tới board chứa thẻ đó. */
  openNotification(n: AppNotification): void {
    this.notificationService.markRead(n.id);
    this.notifyMenuOpen.set(false);
    if (!n.boardId) return;
    // Route là /:orgSlug/board/:id — slug đi kèm trong payload nên không phải
    // đoán tổ chức nào (người dùng có thể đang mở tổ chức khác).
    const slug = n.orgSlug || this.orgService.activeOrgSlug();
    void this.router.navigate(['/', slug, 'board', n.boardId]);
  }

  /** Lỗi khi trả lời lời mời (vd lời mời đã bị huỷ) — hiện ngay trong chuông. */
  readonly inviteError = signal<string | null>(null);

  async acceptInvite(inviteId: string): Promise<void> {
    this.inviteError.set(await this.orgService.respondInvite(inviteId, true));
  }

  async declineInvite(inviteId: string): Promise<void> {
    this.inviteError.set(await this.orgService.respondInvite(inviteId, false));
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }

  toggleUserMenu(): void {
    this.createMenuOpen.set(false);
    this.menuOpen.update((v) => !v);
  }

  toggleCreateMenu(): void {
    this.menuOpen.set(false);
    this.createMenuOpen.update((v) => !v);
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.workspaceUi.setSearchQuery(value);
  }

  requestCreateBoard(): void {
    this.createMenuOpen.set(false);
    this.workspaceUi.requestCreateBoard();
    void this.router.navigateByUrl('/workspace');
  }

  requestCreateWorkspace(): void {
    this.createMenuOpen.set(false);
    this.workspaceUi.requestCreateWorkspace();
    void this.router.navigateByUrl('/workspace');
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

