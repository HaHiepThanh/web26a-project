import { Component, input, output } from '@angular/core';
import { LucideBuilding2, LucideCheck, LucideEllipsisVertical, LucidePlus } from '@lucide/angular';
import { Organization } from '../../../mocks';

/** Danh sách Organization ở sidebar — chuyển đổi & mở modal tạo mới/quản lý. */
@Component({
  selector: 'app-org-switcher',
  imports: [LucideBuilding2, LucideCheck, LucideEllipsisVertical, LucidePlus],
  templateUrl: './org-switcher.html',
  styleUrl: './org-switcher.css',
  host: { class: 'block' },
})
export class OrgSwitcher {
  readonly organizations = input<Organization[]>([]);
  readonly activeOrg = input<Organization | null>(null);
  readonly currentUserId = input<string | null>(null);

  readonly switchOrg = output<string>();
  readonly openCreateOrg = output<void>();
  readonly manageOrg = output<string>();

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
    this.openCreateOrg.emit();
  }
}
