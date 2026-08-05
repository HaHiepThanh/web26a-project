import { Component, ElementRef, HostListener, inject, input, output, signal } from '@angular/core';
import { List } from '../../../models';

/** Tiêu đề "dính" của 1 cột: tên sửa được inline, dot màu, đếm số thẻ, menu "..." xoá danh sách (#2). */
@Component({
  selector: 'app-list-header',
  imports: [],
  templateUrl: './list-header.html',
  styleUrl: './list-header.css',
})
export class ListHeader {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly list = input.required<List>();
  readonly cardCount = input(0);

  readonly rename = output<string>();
  readonly deleteList = output<void>();
  readonly collapseToggle = output<void>();

  readonly menuOpen = signal(false);

  toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.menuOpen() && !this.host.nativeElement.contains(event.target as Node)) {
      this.menuOpen.set(false);
    }
  }

  onNameChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    if (value && value !== this.list().name) this.rename.emit(value);
  }

  onDeleteClick(): void {
    this.menuOpen.set(false);
    this.deleteList.emit();
  }
}
