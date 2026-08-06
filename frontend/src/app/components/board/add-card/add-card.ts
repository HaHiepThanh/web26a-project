import { Component, output } from '@angular/core';

/** Nút "+ Thêm thẻ" cuối cột — mở modal đầy đủ (tên, nhãn, ưu tiên, phụ trách, hạn) ở board.ts (#2). */
@Component({
  selector: 'app-add-card',
  imports: [],
  templateUrl: './add-card.html',
  styleUrl: './add-card.css',
})
export class AddCard {
  readonly open = output<void>();
}
