import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideTriangleAlert } from '@lucide/angular';
import { OrganizationStore } from '../../../ngrx/organization/organization.store';
import { User, WorkspaceVisibility } from '../../../models';
import { WorkspaceItem, WorkspaceMember, avatarBgFor, initialsOf } from '../../../mocks';

/**
 * Modal tạo / sửa Không gian làm việc.
 *
 * Phần "ai thấy được workspace này" có hai lựa chọn:
 *   • Cả tổ chức        (`visibility: 'org'`)
 *   • Chỉ định thành viên (`visibility: 'restricted'`)
 *
 * Khi chỉ định, danh sách xổ ra là TOÀN BỘ thành viên tổ chức (lấy từ
 * `GET /organizations/:id/members`), lọc tại chỗ theo tên / email / id.
 *
 * ⚠️ Bản trước lấy danh sách từ `AuthService.getSearchableUsers()` — đọc
 *    localStorage nên chỉ có người đã đăng nhập trên chính máy này. Dán uid của
 *    đồng nghiệp vào thì không tìm thấy, và tệ hơn là nó BỊA ra một người tên
 *    `User-a1b2c3d4` với email giả. Giờ nguồn dữ liệu là danh sách thành viên
 *    thật của tổ chức, không có nhánh nào tạo người dùng giả nữa.
 */
@Component({
  selector: 'app-workspace-form-modal',
  imports: [NgClass, FormsModule, LucideTriangleAlert],
  templateUrl: './workspace-form-modal.html',
})
export class WorkspaceFormModal {
  private readonly orgService = inject(OrganizationStore);

  readonly isOpen = input<boolean>(false);
  readonly mode = input<'create' | 'edit'>('create');
  readonly workspace = input<WorkspaceItem | null>(null);
  readonly currentUser = input<User | null>(null);

  readonly close = output<void>();
  readonly save = output<{
    name: string;
    description: string;
    visibility: WorkspaceVisibility;
    memberIds: string[];
    members: WorkspaceMember[];
  }>();
  readonly delete = output<string>();

  readonly nameInput = signal('');
  readonly nameError = signal<string | null>(null);
  readonly descInput = signal('');
  readonly deleteConfirmArmed = signal(false);

  readonly visibility = signal<WorkspaceVisibility>('org');
  /** id những người được tick. Người tạo luôn nằm trong đây và không gỡ được. */
  readonly selectedIds = signal<string[]>([]);
  readonly memberSearch = signal('');

  readonly initialsOf = initialsOf;
  readonly avatarBgFor = avatarBgFor;

  /** Toàn bộ thành viên tổ chức đang mở — nguồn duy nhất cho ô chỉ định. */
  readonly orgMembers = computed(() => this.orgService.membersOf(this.orgService.activeOrgId()));

  /** Không gỡ được chính mình ra khỏi workspace mình tạo — gỡ xong là mất luôn quyền vào. */
  readonly ownerId = computed(() => this.currentUser()?.id ?? '');

  /** Lọc tại chỗ theo tên / email / id. Danh sách thành viên tổ chức đã nằm sẵn
   *  trong bộ nhớ nên không cần gọi API mỗi lần gõ. */
  readonly filteredMembers = computed(() => {
    const q = this.memberSearch().trim().toLowerCase();
    const all = this.orgMembers();
    if (!q) return all;
    return all.filter((m) => {
      const u = m.user;
      return (
        u.id.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.displayName ?? '').toLowerCase().includes(q)
      );
    });
  });

  readonly selectedCount = computed(() => this.selectedIds().length);

  constructor() {
    effect(() => {
      if (!this.isOpen()) return;

      const ws = this.workspace();
      const m = this.mode();
      this.nameError.set(null);
      this.deleteConfirmArmed.set(false);
      this.memberSearch.set('');

      // Danh sách thành viên tổ chức có thể chưa nạp (mở thẳng bằng URL) — gọi
      // ở đây để ô chỉ định không rỗng ngay lần mở đầu tiên.
      void this.orgService.ensureLoaded();

      if (m === 'edit' && ws) {
        this.nameInput.set(ws.name);
        this.descInput.set(ws.description);
        this.visibility.set(ws.visibility ?? 'org');
        this.selectedIds.set([...(ws.memberIds ?? [])]);
      } else {
        this.nameInput.set('');
        this.descInput.set('');
        this.visibility.set('org');
        this.selectedIds.set(this.ownerId() ? [this.ownerId()] : []);
      }
    });
  }

  isSelected(userId: string): boolean {
    return this.selectedIds().includes(userId);
  }

  /** Người tạo workspace không bỏ tick được — bỏ ra là tự khoá mình ở ngoài. */
  isLocked(userId: string): boolean {
    return userId === this.ownerId();
  }

  toggleMember(userId: string): void {
    if (this.isLocked(userId)) return;
    this.selectedIds.update((ids) =>
      ids.includes(userId) ? ids.filter((i) => i !== userId) : [...ids, userId],
    );
  }

  setVisibility(v: WorkspaceVisibility): void {
    this.visibility.set(v);
    // Vừa chuyển sang "chỉ định" mà chưa tick ai thì ít nhất phải có người tạo,
    // không thì lưu xong không ai vào được, kể cả chính họ.
    if (v === 'restricted' && !this.selectedIds().length && this.ownerId()) {
      this.selectedIds.set([this.ownerId()]);
    }
  }

  onSubmit(): void {
    const name = this.nameInput().trim();
    if (!name) {
      this.nameError.set('Please enter a Workspace name!');
      return;
    }
    if (name.length > 50) {
      this.nameError.set('Workspace name must be at most 50 characters!');
      return;
    }
    this.nameError.set(null);

    const visibility = this.visibility();
    const memberIds =
      visibility === 'restricted'
        ? [...new Set([this.ownerId(), ...this.selectedIds()].filter(Boolean))]
        : [];

    // `members` (kèm tên/email) chỉ để trang Workspace vẽ ngay mà không phải gọi
    // lại API — backend chỉ nhận `memberIds`.
    const byId = new Map(this.orgMembers().map((m) => [m.user.id, m.user]));
    const members: WorkspaceMember[] = (visibility === 'restricted' ? memberIds : [...byId.keys()])
      .map((id) => byId.get(id))
      .filter((u): u is User => !!u)
      .map((u) => ({
        id: u.id,
        displayName: u.displayName || u.email.split('@')[0],
        email: u.email,
        role: u.id === this.ownerId() ? 'owner' : 'member',
        avatarUrl: u.avatarUrl,
      }));

    this.save.emit({ name, description: this.descInput().trim(), visibility, memberIds, members });
  }

  confirmDelete(): void {
    if (!this.deleteConfirmArmed()) {
      this.deleteConfirmArmed.set(true);
      return;
    }
    const ws = this.workspace();
    if (ws) this.delete.emit(ws.id);
  }
}
