import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-create-list-modal',
  imports: [FormsModule],
  templateUrl: './create-list-modal.html',
})
export class CreateListModal {
  readonly isOpen = input<boolean>(false);
  readonly close = output<void>();
  readonly create = output<{ name: string; color: string }>();

  readonly listName = signal('');
  readonly listColor = signal('#64748b');

  readonly listColors = [
    '#64748b', '#2563eb', '#059669', '#d97706', '#dc2626',
    '#7c3aed', '#0d9488', '#ea580c', '#db2777', '#475569',
  ];

  onSubmit(): void {
    const name = this.listName().trim();
    if (!name) return;
    this.create.emit({ name, color: this.listColor() });
    this.listName.set('');
  }
}
