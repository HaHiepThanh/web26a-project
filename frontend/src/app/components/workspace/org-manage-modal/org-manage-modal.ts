import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideBuilding2,
  LucideCheck,
  LucideCopy,
  LucideCrown,
  LucideLink,
  LucideSearch,
  LucideTrash2,
  LucideUserPlus,
  LucideX,
} from '@lucide/angular';
import { AuthService } from '../../../services/auth.service';
import { UserSearchService } from '../../../services/user-search.service';
import {
  ApiInviteLink,
  ApiUserSearchResult,
  InviteLinkRole,
  OrgInviteRole,
  OrgMemberView,
  Role,
} from '../../../models';
import { InviteLinkStore } from '../../../ngrx/invite-link/invite-link.store';
import { Organization, OrgInvite, avatarBgFor, initialsOf } from '../../../mocks';
import { UserAvatar } from '../../shared/user-avatar/user-avatar';

/** Modal quản lý 1 Organization: đổi tên, mời thành viên qua UUID/email/tên,
 *  xem & huỷ lời mời đang chờ, xoá thành viên. Tách khỏi sidebar vì danh sách
 *  thành viên là dữ liệu dài không giới hạn — nhét vào sidebar sẽ đẩy các nút
 *  chính (Tạo Workspace...) xuống dưới màn hình khi tổ chức đông người. */
@Component({
  selector: 'app-org-manage-modal',
  imports: [
    FormsModule,
    LucideBuilding2,
    LucideCheck,
    LucideCopy,
    LucideCrown,
    LucideLink,
    LucideSearch,
    LucideTrash2,
    LucideUserPlus,
    LucideX,
    UserAvatar,
  ],
  templateUrl: './org-manage-modal.html',
})
export class OrgManageModal {
  private readonly auth = inject(AuthService);
  private readonly userSearch = inject(UserSearchService);
  private readonly inviteLinks = inject(InviteLinkStore);

  readonly isOpen = input<boolean>(false);
  readonly org = input<Organization | null>(null);
  /** Kèm role — trước đây chỉ là `User[]` nên không hiện được ai là quản trị. */
  readonly members = input<OrgMemberView[]>([]);
  readonly pendingInvites = input<OrgInvite[]>([]);

  readonly close = output<void>();
  readonly invite = output<{ orgId: string; uuid: string; role: OrgInviteRole }>();
  readonly removeMember = output<{ orgId: string; userId: string }>();
  readonly changeRole = output<{ orgId: string; userId: string; role: Role }>();
  readonly cancelInvite = output<string>();
  readonly rename = output<{ orgId: string; name: string }>();

  readonly initialsOf = initialsOf;
  readonly avatarBgFor = avatarBgFor;

  readonly nameInput = signal('');
  readonly searchInput = signal('');
  /** Quyền người được mời sẽ nhận khi họ bấm Đồng ý. */
  readonly inviteRole = signal<OrgInviteRole>('member');
  readonly feedback = signal<{ ok: boolean; text: string } | null>(null);


  /** Chủ sở hữu mới được đổi tên/xoá thành viên — thành viên thường chỉ xem. */
  readonly isOwner = computed(() => {
    const o = this.org();
    return !!o && o.ownerId === this.auth.currentUser()?.id;
  });

  readonly nameDirty = computed(() => {
    const o = this.org();
    if (!o) return false;
    return this.nameInput().trim() !== o.name;
  });

  // ------------------------------------------------------------ link mời

  /**
   * Ai được quản lý link: owner HOẶC admin — khác `isOwner` ở trên (chỉ owner).
   *
   * Đây chỉ để ẩn/hiện giao diện cho gọn mắt, KHÔNG phải lớp bảo mật: backend
   * đã chặn thành viên thường gọi nhóm endpoint này. Nhưng vẫn phải ẩn, vì phần
   * trả về có `token` — không nên vẽ chỗ để nó lỡ hiện ra.
   */
  readonly canManageLinks = computed(() => {
    const o = this.org();
    const me = this.auth.currentUser()?.id;
    if (!o || !me) return false;
    if (o.ownerId === me) return true;
    return this.members().some((m) => m.user.id === me && m.role === 'admin');
  });

  readonly activeLinks = this.inviteLinks.activeLinks;
  readonly linksLoading = this.inviteLinks.loading;
  readonly revokingIds = this.inviteLinks.revoking;

  readonly linkExpiryDays = signal<number>(7);
  readonly linkRole = signal<InviteLinkRole>('member');
  /** Chuỗi rỗng = không giới hạn lượt. Giữ dạng chuỗi vì ô nhập trả về chuỗi. */
  readonly linkMaxUses = signal<string>('');
  /** Link vừa tạo — hiện ô sao chép ngay, khỏi phải đi tìm trong danh sách. */
  readonly justCreated = signal<ApiInviteLink | null>(null);
  readonly copiedId = signal<string | null>(null);

  readonly searching = this.userSearch.searching;
  readonly emptyResult = this.userSearch.emptyResult;

  /**
   * Ứng viên để mời — GỌI BACKEND (`GET /users/search`), lọc bỏ người đã là
   * thành viên và người đang có lời mời chờ.
   *
   * ⚠️ Bản trước tìm trong `AuthService.getSearchableUsers()` — đọc localStorage
   *    nên chỉ có những người đã ĐĂNG NHẬP TRÊN CHÍNH MÁY NÀY. Dán uid của đồng
   *    nghiệp vào thì không bao giờ ra, phải bấm "gửi lời mời tới <chuỗi>" mà
   *    không biết mình đang mời ai.
   */
  readonly searchResults = computed<ApiUserSearchResult[]>(() => {
    const memberIds = new Set(this.members().map((m) => m.user.id));
    const invitedIds = new Set(this.pendingInvites().map((i) => i.toUserId));
    return this.userSearch
      .results()
      .filter((u) => !memberIds.has(u.id) && !invitedIds.has(u.id))
      .slice(0, 6);
  });

  onSearchChange(value: string): void {
    this.searchInput.set(value);
    this.userSearch.search(value);
  }

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        const o = this.org();
        this.nameInput.set(o?.name ?? '');
        this.searchInput.set('');
        this.inviteRole.set('member');
        this.userSearch.clear();
        this.feedback.set(null);
        this.justCreated.set(null);
        this.copiedId.set(null);
        this.linkExpiryDays.set(7);
        this.linkRole.set('member');
        this.linkMaxUses.set('');

        // Chỉ hỏi server khi người này có quyền — thành viên thường gọi vào là
        // ăn 403 vô ích.
        //
        // ⚠️ BẮT BUỘC bọc `untracked`. `loadLinks` ĐỌC `loadedForOrg()` và
        //    `links()` ngay dòng đầu để bỏ qua lần nạp trùng — đọc trong thân
        //    effect là effect này ĐĂNG KÝ luôn hai signal đó. Ngay sau đó
        //    `loadLinks` lại `patchState` chính chúng, nên effect chạy lại →
        //    gọi lại → patch lại... vòng vô hạn.
        //
        //    Hậu quả đo được trên máy thật: hàng nghìn `GET /invite-links` liên
        //    tiếp cho tới khi trình duyệt trả `net::ERR_INSUFFICIENT_RESOURCES`.
        //    Mỗi vòng còn chạy lại cả khối trên, tức `searchInput.set('')` —
        //    người dùng dán id vào ô mời thì bị xoá trắng ngay trước mắt, và
        //    lời mời không bao giờ gửi đi được vì đã cạn socket.
        if (o && this.canManageLinks()) {
          const orgId = o.id;
          untracked(() => void this.inviteLinks.loadLinks(orgId));
        }
      } else {
        // Đóng modal thì bỏ token khỏi bộ nhớ. Nó không có lý do gì sống lâu
        // hơn màn hình đang dùng tới nó. `untracked` vì cùng lý do trên.
        untracked(() => this.inviteLinks.clearLinks());
      }
    });
  }

  onInvite(user: ApiUserSearchResult): void {
    const o = this.org();
    if (!o) return;
    this.invite.emit({ orgId: o.id, uuid: user.id, role: this.inviteRole() });
    this.searchInput.set('');
    this.userSearch.clear();
  }

  /**
   * Mời theo id gõ tay — phương án cuối khi tìm không ra.
   *
   * Backend vẫn kiểm tra id có thật không (khoá ngoại `to_user_id` → `users.id`,
   * sai thì trả 404 "Không tìm thấy người dùng này"), nên ở đây KHÔNG bịa ra
   * người dùng giả như bản trước nữa.
   */
  onInviteRaw(): void {
    const o = this.org();
    const raw = this.searchInput().trim();
    if (!o || !raw) return;
    this.invite.emit({ orgId: o.id, uuid: raw, role: this.inviteRole() });
    this.searchInput.set('');
    this.userSearch.clear();
  }

  onRemove(userId: string): void {
    const o = this.org();
    if (!o) return;
    this.removeMember.emit({ orgId: o.id, userId });
  }

  /** Owner đổi quyền của 1 thành viên (member ↔ admin). */
  onChangeRole(userId: string, role: string): void {
    const o = this.org();
    if (!o || (role !== 'admin' && role !== 'member')) return;
    this.changeRole.emit({ orgId: o.id, userId, role });
  }

  onSaveName(): void {
    const o = this.org();
    const name = this.nameInput().trim();
    if (!o || !name) return;
    this.rename.emit({ orgId: o.id, name });
  }

  // ------------------------------------------------------------ link mời

  /**
   * Link đầy đủ để đưa cho người khác.
   *
   * Ghép ở client bằng `location.origin` chứ không lấy từ server: cùng một
   * backend có thể phục vụ localhost lúc chạy thử và tên miền thật khi triển
   * khai, server không biết người dùng đang mở app ở đâu.
   */
  fullLink(token: string): string {
    return `${location.origin}/join/${token}`;
  }

  async onCreateLink(): Promise<void> {
    const o = this.org();
    if (!o) return;

    // Ô để trống = không giới hạn lượt. Chỉ gửi `maxUses` khi người dùng thật sự
    // gõ một số hợp lệ — gửi 0 hay NaN là ValidationPipe của backend đánh trượt.
    const raw = this.linkMaxUses().trim();
    const parsed = raw ? Number(raw) : NaN;
    const maxUses = Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;

    const link = await this.inviteLinks.createLink(o.id, {
      expiresInDays: this.linkExpiryDays(),
      role: this.linkRole(),
      ...(maxUses === undefined ? {} : { maxUses }),
    });
    if (link) {
      this.justCreated.set(link);
      this.linkMaxUses.set('');
    }
  }

  /**
   * Sao chép link.
   *
   * `navigator.clipboard` cần ngữ cảnh bảo mật (https hoặc localhost) và có thể
   * bị từ chối quyền — hỏng thì chọn sẵn chữ trong ô để người dùng tự Ctrl+C,
   * thay vì im lặng không làm gì.
   */
  async onCopy(link: ApiInviteLink, input: HTMLInputElement): Promise<void> {
    const text = this.fullLink(link.token);
    try {
      await navigator.clipboard.writeText(text);
      this.copiedId.set(link.id);
      setTimeout(() => {
        if (this.copiedId() === link.id) this.copiedId.set(null);
      }, 2000);
    } catch {
      input.select();
    }
  }

  onRevokeLink(linkId: string): void {
    void this.inviteLinks.revokeLink(linkId);
    if (this.justCreated()?.id === linkId) this.justCreated.set(null);
  }

  /** Còn bao lâu, dạng đọc được. Chỉ HIỂN THỊ — sống hay chết đọc `active` của server. */
  expiryLabel(iso: string): string {
    const ms = new Date(iso).getTime() - Date.now();
    if (Number.isNaN(ms)) return '';
    if (ms <= 0) return 'expired';
    // ceil chứ không phải floor: link vừa tạo với hạn 7 ngày còn 6,999 ngày,
    // floor ra '6d left' ngay sau khi người dùng chọn '7 days' — trông như
    // hệ thống ăn bớt mất một ngày.
    const days = Math.ceil(ms / 86_400_000);
    if (days >= 1) return `${days}d left`;
    const hours = Math.max(1, Math.floor(ms / 3_600_000));
    return `${hours}h left`;
  }

  /** '3 / 10 used', hoặc '3 used' khi không giới hạn. */
  usageLabel(link: ApiInviteLink): string {
    return link.maxUses === null
      ? `${link.usedCount} used`
      : `${link.usedCount} / ${link.maxUses} used`;
  }

  /** Component cha gọi lại sau khi service xử lý xong, để hiện kết quả ngay trong modal. */
  showResult(errorMessage: string | null, successText: string): void {
    this.feedback.set(errorMessage ? { ok: false, text: errorMessage } : { ok: true, text: successText });
  }
}
