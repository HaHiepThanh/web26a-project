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
import { User } from '../../../models';
import { Organization, OrgInvite, avatarBgFor, initialsOf } from '../../../mocks';

/** Modal quản lý 1 Organization: đổi tên/icon, mời thành viên qua UUID/email/tên,
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

  readonly isOpen = input<boolean>(false);
  readonly org = input<Organization | null>(null);
  readonly members = input<User[]>([]);
  readonly pendingInvites = input<OrgInvite[]>([]);

  readonly close = output<void>();
  readonly invite = output<{ orgId: string; uuid: string }>();
  readonly removeMember = output<{ orgId: string; userId: string }>();
  readonly cancelInvite = output<string>();
  readonly rename = output<{ orgId: string; name: string; icon: string }>();

  readonly initialsOf = initialsOf;
  readonly avatarBgFor = avatarBgFor;

  readonly nameInput = signal('');
  readonly iconInput = signal('🏢');
  readonly searchInput = signal('');
  readonly feedback = signal<{ ok: boolean; text: string } | null>(null);

  readonly iconChoices = ['🏢', '🚀', '💼', '🌐', '⚡', '🔥', '🎯', '📊', '🏗️', '🧩', '🎓', '✨'];

  /** Chủ sở hữu mới được đổi tên/xoá thành viên — thành viên thường chỉ xem. */
  readonly isOwner = computed(() => {
    const o = this.org();
    return !!o && o.ownerId === this.auth.currentUser()?.id;
  });

  readonly nameDirty = computed(() => {
    const o = this.org();
    if (!o) return false;
    return this.nameInput().trim() !== o.name || this.iconInput() !== o.icon;
  });

  /** Ứng viên để mời: loại người đã là thành viên, đã có lời mời chờ, và chính mình. */
  readonly searchResults = computed(() => {
    const q = this.searchInput().trim().toLowerCase();
    if (!q) return [];
    const memberIds = new Set(this.members().map((m) => m.id.toLowerCase()));
    const invitedIds = new Set(this.pendingInvites().map((i) => i.toUserId.toLowerCase()));
    const meId = this.auth.currentUser()?.id.toLowerCase();

    return this.auth
      .getSearchableUsers()
      .filter((u) => {
        const id = u.id.toLowerCase();
        if (id === meId || memberIds.has(id) || invitedIds.has(id)) return false;
        return (
          id.includes(q) || (u.displayName && u.displayName.toLowerCase().includes(q)) || u.email.toLowerCase().includes(q)
        );
      })
      .slice(0, 6);
  });

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        const o = this.org();
        this.nameInput.set(o?.name ?? '');
        this.iconInput.set(o?.icon ?? '🏢');
        this.searchInput.set('');
        this.feedback.set(null);
      }
    });
  }

  onInvite(user: User): void {
    const o = this.org();
    if (!o) return;
    this.invite.emit({ orgId: o.id, uuid: user.id });
    this.searchInput.set('');
  }

  /** Mời theo UUID gõ tay (trường hợp người dùng dán UUID của người chưa từng đăng nhập máy này). */
  onInviteRaw(): void {
    const o = this.org();
    const raw = this.searchInput().trim();
    if (!o || !raw) return;
    this.invite.emit({ orgId: o.id, uuid: raw });
    this.searchInput.set('');
  }

  onRemove(userId: string): void {
    const o = this.org();
    if (!o) return;
    this.removeMember.emit({ orgId: o.id, userId });
  }

  onSaveName(): void {
    const o = this.org();
    const name = this.nameInput().trim();
    if (!o || !name) return;
    this.rename.emit({ orgId: o.id, name, icon: this.iconInput() });
  }

  /** Component cha gọi lại sau khi service xử lý xong, để hiện kết quả ngay trong modal. */
  showResult(errorMessage: string | null, successText: string): void {
    this.feedback.set(errorMessage ? { ok: false, text: errorMessage } : { ok: true, text: successText });
  }
}
