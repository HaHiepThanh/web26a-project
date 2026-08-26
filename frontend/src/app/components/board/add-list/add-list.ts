import { Component, ElementRef, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

/** Ô "+ Thêm danh sách" cuối hàng — bấm vào là gõ tên & thêm trực tiếp (kiểu Trello),
 *  không mở modal riêng. */
@Component({
  selector: 'app-add-list',
  imports: [FormsModule],
  templateUrl: './add-list.html',
  styleUrl: './add-list.css',
  // Neo của tour đặt trên HOST, không đặt trên cái nút bên trong.
  //
  // Template có hai nhánh: chưa sửa thì là nút, đang sửa thì là ô nhập — nút
  // BIẾN MẤT khỏi DOM ngay khi người dùng bấm vào nó. Neo nằm trên nút thì tour
  // vừa được người dùng làm theo là mất neo, hết 3 giây thì bỏ qua bước 3, rồi
  // bước 4 (neo `add-card` chỉ có bên trong một cột) cũng không tìm được nốt —
  // tour tự kết thúc trong khi người dùng đang gõ tên cột.
  // Host tồn tại ở cả hai trạng thái và không thêm thẻ DOM nào.
  host: { 'data-tour': 'add-list' },
})
export class AddList {
  readonly create = output<string>();

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  readonly editing = signal(false);
  readonly name = signal('');

  startEditing(): void {
    this.editing.set(true);
    this.name.set('');
    setTimeout(() => this.nameInput()?.nativeElement.focus());
  }

  submit(): void {
    const trimmed = this.name().trim();
    if (!trimmed) {
      this.cancel();
      return;
    }
    this.create.emit(trimmed);
    this.editing.set(false);
    this.name.set('');
  }

  cancel(): void {
    this.editing.set(false);
    this.name.set('');
  }
}
