import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideBuilding2,
  LucideCheck,
  LucideCrown,
  LucideSearch,
  LucideTrash2,
  LucideUserPlus,
  LucideX,
} from '@lucide/angular';
import { AuthService } from '../../../services/auth.service';
import { UserSearchService } from '../../../services/user-search.service';
import { ApiUserSearchResult, OrgInviteRole, OrgMemberView, Role } from '../../../models';
import { Organization, OrgInvite, avatarBgFor, initialsOf } from '../../../mocks';

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
    LucideCrown,
    LucideSearch,
    LucideTrash2,
    LucideUserPlus,
    LucideX,
  ],
  templateUrl: './org-manage-modal.html',
})
export class OrgManageModal {
  private readonly auth = inject(AuthService);
  private readonly userSearch = inject(UserSearchService);

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

  /** Component cha gọi lại sau khi service xử lý xong, để hiện kết quả ngay trong modal. */
  showResult(errorMessage: string | null, successText: string): void {
    this.feedback.set(errorMessage ? { ok: false, text: errorMessage } : { ok: true, text: successText });
  }
}
