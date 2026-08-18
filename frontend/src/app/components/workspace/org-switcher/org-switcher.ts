import { Component, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideBuilding2, LucideCheck, LucidePlus, LucideUserPlus } from '@lucide/angular';
import { Organization } from '../../../mocks';

@Component({
  selector: 'app-org-switcher',
  imports: [FormsModule, LucideBuilding2, LucideCheck, LucidePlus, LucideUserPlus],
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
  readonly inviteMember = output<{ orgId: string; uuid: string }>();

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly uuidInput = viewChild<ElementRef<HTMLInputElement>>('uuidInput');

  readonly creating = signal(false);
  readonly newName = signal('');

  readonly inviting = signal(false);
  readonly inviteUuid = signal('');
  readonly inviteFeedback = signal<{ ok: boolean; text: string } | null>(null);

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

  startInvite(): void {
    this.inviting.set(true);
    this.inviteUuid.set('');
    this.inviteFeedback.set(null);
    setTimeout(() => this.uuidInput()?.nativeElement.focus());
  }

  submitInvite(): void {
    const org = this.activeOrg();
    const uuid = this.inviteUuid().trim();
    if (!org || !uuid) return;
    this.inviteMember.emit({ orgId: org.id, uuid });
  }

  cancelInvite(): void {
    this.inviting.set(false);
    this.inviteUuid.set('');
    this.inviteFeedback.set(null);
  }

  /** Gọi từ component cha sau khi service xử lý xong lời mời, để hiển thị kết quả ngay tại đây. */
  showInviteResult(errorMessage: string | null): void {
    if (errorMessage) {
      this.inviteFeedback.set({ ok: false, text: errorMessage });
    } else {
      this.inviteFeedback.set({ ok: true, text: 'Đã gửi lời mời! Chờ họ đồng ý ở icon 🔔 trên header.' });
      this.inviteUuid.set('');
    }
  }
}
