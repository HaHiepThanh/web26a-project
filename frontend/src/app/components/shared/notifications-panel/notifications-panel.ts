import { Component, input, output } from '@angular/core';
import { AppNotification } from '../../../models';
import { relativeTimeFrom } from '../../../utils/avatar.util';

/**
 * Ruột của bảng thông báo — KHÔNG kèm khung định vị.
 *
 * Cố ý chỉ dựng phần nội dung: trên máy tính bảng này thả xuống từ chuông ở
 * header, trên điện thoại nó bật lên từ thanh dưới. Hai chỗ đặt khác nhau nên
 * việc định vị (absolute/bottom/right...) để nơi gọi tự lo, còn phần bên trong
 * thì dùng chung để hai nơi không bao giờ hiện hai kiểu danh sách khác nhau.
 */
@Component({
  selector: 'app-notifications-panel',
  imports: [],
  templateUrl: './notifications-panel.html',
  host: { class: 'block' },
})
export class NotificationsPanel {
  readonly notifications = input<AppNotification[]>([]);
  readonly unreadCount = input(0);
  /** Số thẻ của tôi sắp/đã quá hạn — hiện thành một dải nhắc riêng phía trên. */
  readonly dueCount = input(0);

  readonly markAllRead = output<void>();
  readonly openNotification = output<AppNotification>();

  readonly relativeTimeFrom = relativeTimeFrom;
}
