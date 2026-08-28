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

  /** Nền + màu chữ theo loại thông báo. */
  iconClass(type: AppNotification['type']): string {
    switch (type) {
      case 'card.overdue':
        return 'bg-error/15 text-error';
      case 'meeting.started':
        return 'bg-success/15 text-success';
      case 'chat.mention':
        return 'bg-secondary/15 text-secondary';
      case 'meeting.scheduled':
        return 'bg-info/15 text-info';
      default:
        return 'bg-primary/15 text-primary';
    }
  }

  /** Hình vẽ theo loại — camera cho cuộc họp, @ cho nhắc tên, đồng hồ cho quá
   *  hạn, người cho được giao việc. */
  iconPath(type: AppNotification['type']): string {
    switch (type) {
      case 'card.overdue':
        return 'M12 8v4l2.5 2.5M12 21a9 9 0 100-18 9 9 0 000 18z';
      case 'meeting.started':
        return 'M15 10l4.55-2.27A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.89L15 14M5 6h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z';
      case 'chat.mention':
        return 'M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9';
      // Lịch có dấu cộng — vừa được hẹn.
      case 'meeting.scheduled':
        return 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM12 14v4M10 16h4';
      default:
        return 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z';
    }
  }
}
