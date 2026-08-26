import { Component, input, output } from '@angular/core';
import { LucideCheck, LucideX } from '@lucide/angular';
import { OrgInvite } from '../../../models';

/**
 * Ruột của bảng "Lời mời tham gia tổ chức" — không kèm khung định vị, cùng lý do
 * như `NotificationsPanel`: header thả xuống, thanh dưới bật lên.
 */
@Component({
  selector: 'app-invites-panel',
  imports: [LucideCheck, LucideX],
  templateUrl: './invites-panel.html',
  host: { class: 'block' },
})
export class InvitesPanel {
  readonly invites = input<OrgInvite[]>([]);
  /** Câu lỗi khi trả lời hỏng (vd lời mời đã bị huỷ) — hiện ngay trong bảng,
   *  vì đây là nơi người dùng vừa bấm, không nên bắn ra chỗ khác. */
  readonly error = input<string | null>(null);

  readonly accept = output<string>();
  readonly decline = output<string>();
}
