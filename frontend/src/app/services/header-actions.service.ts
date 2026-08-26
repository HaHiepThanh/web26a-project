import { Injectable, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AppNotification } from '../models';
import { CardStore } from '../ngrx/card/card.store';
import { OrganizationStore } from '../ngrx/organization/organization.store';
import { NotificationService } from './notification.service';
import { ThemeService } from './theme.service';
import { WorkspaceUiService } from './workspace-ui.service';

/**
 * Những hành động mà thanh trên (Header) và thanh dưới dành cho điện thoại
 * (MobileActionBar) đều cần: chuông thông báo, lời mời tổ chức, đổi giao diện,
 * tạo nhanh, ô tìm kiếm.
 *
 * Gom vào đây thay vì để mỗi thanh tự viết lấy, vì hai thanh là HAI cách trình
 * bày của CÙNG một tập chức năng. Nếu chép logic sang thanh thứ hai thì mỗi lần
 * sửa (đổi cách tính badge, đổi đường dẫn khi bấm thông báo) đều phải nhớ sửa cả
 * hai chỗ — quên một chỗ là hai thanh nói hai điều khác nhau trên cùng màn hình.
 *
 * Ở đây KHÔNG giữ trạng thái đóng/mở của menu: cái đó thuộc về từng thanh, và
 * hai thanh không bao giờ hiện cùng lúc nên cũng không cần đồng bộ.
 */
@Injectable({ providedIn: 'root' })
export class HeaderActionsService {
  private readonly router = inject(Router);
  private readonly cardService = inject(CardStore);
  private readonly orgService = inject(OrganizationStore);
  private readonly notificationService = inject(NotificationService);
  private readonly themeService = inject(ThemeService);
  private readonly workspaceUi = inject(WorkspaceUiService);

  /* ----------------------------- đọc ----------------------------- */

  readonly theme = this.themeService.theme;

  readonly notifications = this.notificationService.items;
  readonly unreadNotifications = this.notificationService.unreadCount;

  readonly myInvites = this.orgService.myInvites;
  readonly pendingInviteCount = this.orgService.pendingInviteCount;

  /** Thành viên thường không tạo được workspace/board — ẩn mục trong menu tạo
   *  nhanh cho gọn mắt. Backend (assertCanManage) mới là nơi chặn thật. */
  readonly canManage = this.orgService.isAdminOrOwner;

  /** Nhắc hạn: thẻ của "tôi" đã quá hạn hoặc sắp tới hạn ở board mở gần nhất. */
  readonly dueBadgeCount = computed(() => {
    const c = this.cardService.myDueCounts();
    return c.overdue + c.dueSoon;
  });

  /** Badge của chuông: thông báo chưa đọc cộng số thẻ tới hạn. */
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

  /** Có gì đó đang cần chú ý hay không — dùng cho chấm đỏ trên nút menu chính
   *  của thanh dưới, nơi chỉ đủ chỗ cho MỘT dấu hiệu chung. */
  readonly hasAlerts = computed(() => this.bellBadgeCount() > 0 || this.pendingInviteCount() > 0);

  /* ---------------------------- hành động ---------------------------- */

  markAllNotificationsRead(): void {
    this.notificationService.markAllRead();
  }

  /** Bấm một thông báo: đánh dấu đã đọc rồi đi thẳng tới board chứa thẻ đó.
   *  Slug đi kèm trong dữ liệu nên không phải đoán tổ chức nào — người dùng có
   *  thể đang mở một tổ chức khác với tổ chức chứa thẻ. */
  openNotification(n: AppNotification): void {
    this.notificationService.markRead(n.id);
    if (!n.boardId) return;
    const slug = n.orgSlug || this.orgService.activeOrgSlug();
    void this.router.navigate(['/', slug, 'board', n.boardId]);
  }

  /** Trả về câu lỗi nếu có (vd lời mời đã bị huỷ), `null` nếu xuôi. */
  acceptInvite(inviteId: string): Promise<string | null> {
    return this.orgService.respondInvite(inviteId, true);
  }

  declineInvite(inviteId: string): Promise<string | null> {
    return this.orgService.respondInvite(inviteId, false);
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }

  setSearchQuery(value: string): void {
    this.workspaceUi.setSearchQuery(value);
  }

  /** Tạo nhanh chỉ có nghĩa ở trang Workspace (nơi có modal tương ứng), nên đặt
   *  yêu cầu rồi điều hướng về đó — bấm từ trong board vẫn chạy. */
  requestCreateBoard(): void {
    this.workspaceUi.requestCreateBoard();
    void this.router.navigateByUrl('/workspace');
  }

  requestCreateWorkspace(): void {
    this.workspaceUi.requestCreateWorkspace();
    void this.router.navigateByUrl('/workspace');
  }
}
