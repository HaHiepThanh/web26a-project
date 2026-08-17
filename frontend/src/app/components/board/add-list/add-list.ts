import { Component, ElementRef, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

/** Ô "+ Thêm danh sách" cuối hàng — bấm vào là gõ tên & thêm trực tiếp (kiểu Trello),
 *  không mở modal riêng. */
@Component({
  selector: 'app-add-list',
  imports: [FormsModule],
  templateUrl: './add-list.html',
  styleUrl: './add-list.css',
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
