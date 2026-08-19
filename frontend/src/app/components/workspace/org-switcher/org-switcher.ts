import { Component, input, output } from '@angular/core';
import { LucideBuilding2, LucideCheck, LucideEllipsisVertical, LucidePlus } from '@lucide/angular';
import { Organization, initialsOf } from '../../../mocks';

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

  readonly initialsOf = initialsOf;

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
