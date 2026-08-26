import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import {
  LucideBell,
  LucideFolderKanban,
  LucideKanban,
  LucideMenu,
  LucideMoon,
  LucidePlus,
  LucideSearch,
  LucideSun,
  LucideUser,
  LucideUserPlus,
  LucideX,
} from '@lucide/angular';
import { AppNotification } from '../../models';
import { HeaderActionsService } from '../../services/header-actions.service';
import { WorkspaceUiService } from '../../services/workspace-ui.service';
import { InvitesPanel } from '../shared/invites-panel/invites-panel';
import { NotificationsPanel } from '../shared/notifications-panel/notifications-panel';

/** Bảng nào đang mở phía trên thanh. Một tại một thời điểm — màn hình điện thoại
 *  không đủ chỗ cho hai bảng, mà chồng lên nhau thì không đọc được cái nào. */
type OpenPanel = 'none' | 'notifications' | 'invites' | 'create';

/**
 * Thanh thao tác nổi ở đáy màn hình, CHỈ dành cho điện thoại và máy tính bảng
 * (`< lg`). Trên máy tính mọi thứ vẫn nằm ở header như cũ.
 *
 * Vì sao phải có: header nhét vừa logo, ô tìm kiếm, nút tạo, chuông, lời mời,
 * đổi giao diện, cài đặt và ô người dùng — trên màn hình hẹp thì chừng ấy không
 * thể cùng nằm một hàng, thứ bị đẩy ra ngoài luôn là mấy nút cuối. Thay vì cố
 * bóp cho vừa, ở khổ hẹp header chỉ giữ logo và avatar, còn lại dời xuống đây —
 * cạnh dưới cũng là chỗ ngón tay cầm điện thoại với tới dễ nhất.
 *
 * Bố cục: khung `fixed` phủ ngang đáy nhưng để `pointer-events-none`, chỉ các
 * cụm nút bên trong mới `pointer-events-auto`. Nhờ vậy khoảng trống ở giữa hai
 * cụm KHÔNG chặn thao tác vào nội dung nằm dưới.
 */
@Component({
  selector: 'app-mobile-action-bar',
  imports: [
    RouterLink,
    LucideBell,
    LucideFolderKanban,
    LucideKanban,
    LucideMenu,
    LucideMoon,
    LucidePlus,
    LucideSearch,
    LucideSun,
    LucideUser,
    LucideUserPlus,
    LucideX,
    NotificationsPanel,
    InvitesPanel,
  ],
  templateUrl: './mobile-action-bar.html',
  styleUrl: './mobile-action-bar.css',
})
export class MobileActionBar {
  readonly actions = inject(HeaderActionsService);
  private readonly workspaceUi = inject(WorkspaceUiService);
  private readonly router = inject(Router);

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  /* --------------------------- trạng thái --------------------------- */

  readonly dialOpen = signal(false);
  readonly panel = signal<OpenPanel>('none');
  readonly searchOpen = signal(false);
  readonly inviteError = signal<string | null>(null);

  /** Ô tìm kiếm thu lại rồi thì không còn thấy chữ đã gõ, nên khi vẫn đang lọc
   *  ta tô sáng icon để người dùng biết danh sách đang bị lọc chứ không phải
   *  trống. Thiếu dấu hiệu này thì "sao workspace của tôi biến mất" là câu hỏi
   *  gần như chắc chắn sẽ xảy ra. */
  readonly hasQuery = computed(() => this.workspaceUi.searchQuery().trim().length > 0);

  /** Chữ đang lọc — ràng vào `value` của ô nhập để lúc mở lại vẫn thấy đúng thứ
   *  mình đã gõ, thay vì ô trống trong khi danh sách vẫn đang bị lọc. */
  readonly workspaceUiQuery = this.workspaceUi.searchQuery;

  /** Đang mở bảng HOẶC đang bung speed dial thì phủ một lớp trong suốt, để bấm
   *  ra ngoài là đóng — trên điện thoại không có "bấm ra chỗ trống" nào khác.
   *  Lớp phủ ở `z-40` còn thanh ở `z-50` nên các nút vẫn bấm được bình thường. */
  readonly backdropVisible = computed(() => this.panel() !== 'none' || this.dialOpen());

  constructor() {
    // Đi sang trang khác thì dọn sạch thanh. Không có chỗ này thì bấm "Profile
    // settings" (hoặc bấm một thông báo) sẽ để speed dial mở nguyên cùng lớp phủ
    // `inset-0` của nó — lớp phủ đó phủ kín trang vừa mở và nuốt mọi cú chạm.
    // Thanh sống suốt vòng đời app cùng AppLayout nên vẫn dùng takeUntilDestroyed
    // cho đúng phép, không dựa vào việc nó không bao giờ bị huỷ.
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.closeAll());

    // Mở ô tìm kiếm thì đặt con trỏ vào luôn — người dùng bấm icon là để gõ,
    // bắt họ bấm thêm lần nữa vào ô là thừa một thao tác.
    effect(() => {
      if (!this.searchOpen()) return;
      untracked(() => {
        // Chờ hết khung hình hiện tại: lúc effect chạy, ô còn đang rộng 0px và
        // `focus()` vào phần tử chưa hiện hình thì trình duyệt bỏ qua.
        requestAnimationFrame(() => this.searchInput()?.nativeElement.focus());
      });
    });
  }

  /* ---------------------------- tìm kiếm ---------------------------- */

  openSearch(): void {
    this.closeAll();
    this.searchOpen.set(true);
  }

  closeSearch(): void {
    this.searchOpen.set(false);
  }

  onSearchInput(event: Event): void {
    this.actions.setSearchQuery((event.target as HTMLInputElement).value);
  }

  /** Xoá chữ đang lọc rồi thu ô lại — nút "x" bên trong ô. */
  clearSearch(): void {
    this.actions.setSearchQuery('');
    this.searchOpen.set(false);
  }

  /* -------------------------- speed dial -------------------------- */

  toggleDial(): void {
    this.searchOpen.set(false);
    const open = !this.dialOpen();
    this.dialOpen.set(open);
    if (!open) this.panel.set('none');
  }

  toggleCreate(): void {
    this.searchOpen.set(false);
    this.dialOpen.set(false);
    this.panel.update((p) => (p === 'create' ? 'none' : 'create'));
  }

  openPanel(which: Exclude<OpenPanel, 'none'>): void {
    this.inviteError.set(null);
    this.panel.update((p) => (p === which ? 'none' : which));
  }

  closeAll(): void {
    this.panel.set('none');
    this.dialOpen.set(false);
  }

  /* --------------------------- hành động --------------------------- */

  onOpenNotification(n: AppNotification): void {
    this.closeAll();
    this.actions.openNotification(n);
  }

  markAllRead(): void {
    this.actions.markAllNotificationsRead();
  }

  async onAccept(inviteId: string): Promise<void> {
    this.inviteError.set(await this.actions.acceptInvite(inviteId));
  }

  async onDecline(inviteId: string): Promise<void> {
    this.inviteError.set(await this.actions.declineInvite(inviteId));
  }

  toggleTheme(): void {
    this.actions.toggleTheme();
  }

  createBoard(): void {
    this.closeAll();
    this.actions.requestCreateBoard();
  }

  createWorkspace(): void {
    this.closeAll();
    this.actions.requestCreateWorkspace();
  }
}
