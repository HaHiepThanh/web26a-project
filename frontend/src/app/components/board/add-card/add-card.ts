import { Component, input, output } from '@angular/core';

/** Nút "+ Thêm thẻ" cuối cột — bấm là tạo thẻ ngay (tên mặc định) và mở thẳng
 *  app-card-detail-modal (cùng 1 UI đầy đủ dùng chung với sửa thẻ) để chỉnh sửa. */
@Component({
  selector: 'app-add-card',
  imports: [],
  templateUrl: './add-card.html',
  styleUrl: './add-card.css',
})
export class AddCard {
  /**
   * Đang chờ server tạo thẻ cho ĐÚNG cột này.
   *
   * Cần thật, không phải trang trí: tạo thẻ mất khoảng 2 giây (một vòng tới
   * Supabase), mà trước đây nút không đổi gì trong suốt quãng đó — bấm xong
   * màn hình đứng im, và `board.ts` lại chặn im lặng mọi cú bấm lặp lại. Người
   * dùng không có cách nào biết hệ thống đã nhận lệnh hay chưa, nên kết luận
   * nút hỏng là hoàn toàn hợp lý.
   */
  readonly creating = input(false);

  readonly open = output<void>();
}
