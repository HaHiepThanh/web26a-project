import { Component, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideBuilding2, LucideCheck, LucideEllipsisVertical, LucidePlus } from '@lucide/angular';
import { Organization } from '../../../mocks';

/** Danh sách Organization ở sidebar — CHỈ chuyển đổi + tạo mới.
 *  Mọi thao tác quản lý (mời/xoá thành viên, đổi tên) nằm trong modal riêng
 *  (app-org-manage-modal), mở qua nút 3 chấm — sidebar có bề rộng cố định và
 *  phải luôn giữ nút "Tạo tổ chức mới" trong tầm nhìn, không thể chứa danh
 *  sách thành viên dài tuỳ ý. */
@Component({
  selector: 'app-org-switcher',
  imports: [FormsModule, LucideBuilding2, LucideCheck, LucideEllipsisVertical, LucidePlus],
  templateUrl: './org-switcher.html',
  styleUrl: './org-switcher.css',
  host: { class: 'block' },
})
export class OrgSwitcher {
  readonly organizations = input<Organization[]>([]);
  readonly activeOrg = input<Organization | null>(null);
  readonly currentUserId = input<string | null>(null);

  readonly switchOrg = output<string>();
  readonly createOrg = output<{ name: string; icon: string }>();
  readonly manageOrg = output<string>();

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  readonly creating = signal(false);
  readonly newName = signal('');

  private static readonly ICON_PALETTE = [
    'bg-board-blue',
    'bg-board-purple',
    'bg-board-teal',
    'bg-board-orange',
    'bg-board-green',
    'bg-board-red',
  ];

  /** Màu nền gradient cho icon Organization — cùng bảng màu với board tile (bg-board-*)
   *  để giao diện đồng bộ, chọn theo hash id nên 1 Organization luôn ra cùng 1 màu. */
  iconClassFor(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return OrgSwitcher.ICON_PALETTE[hash % OrgSwitcher.ICON_PALETTE.length];
  }

  onSelect(orgId: string): void {
    this.switchOrg.emit(orgId);
  }

  onManage(orgId: string, event: Event): void {
    event.stopPropagation();
    this.manageOrg.emit(orgId);
  }

  startCreate(): void {
    this.creating.set(true);
    this.newName.set('');
    setTimeout(() => this.nameInput()?.nativeElement.focus());
  }

  submitCreate(): void {
    const trimmed = this.newName().trim();
    if (!trimmed) {
      this.cancelCreate();
      return;
    }
    this.createOrg.emit({ name: trimmed, icon: '🏢' });
    this.creating.set(false);
    this.newName.set('');
  }

  cancelCreate(): void {
    this.creating.set(false);
    this.newName.set('');
  }
}
