import { Component, output } from '@angular/core';

/** Ô "+ Thêm danh sách" cuối hàng — mở modal đầy đủ (tên + màu) ở board.ts (#2). */
@Component({
  selector: 'app-add-list',
  imports: [],
  templateUrl: './add-list.html',
  styleUrl: './add-list.css',
})
export class AddList {
  readonly open = output<void>();
}
