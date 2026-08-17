import { Component, output } from '@angular/core';

/** Nút "+ Thêm thẻ" cuối cột — bấm là tạo thẻ ngay (tên mặc định) và mở thẳng
 *  app-card-detail-modal (cùng 1 UI đầy đủ dùng chung với sửa thẻ) để chỉnh sửa. */
@Component({
  selector: 'app-add-card',
  imports: [],
  templateUrl: './add-card.html',
  styleUrl: './add-card.css',
})
export class AddCard {
  readonly open = output<void>();
}
