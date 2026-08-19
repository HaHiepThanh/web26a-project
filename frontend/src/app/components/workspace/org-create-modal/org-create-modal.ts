import { Component, ElementRef, effect, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideBuilding2, LucideSparkles, LucideTriangleAlert, LucideX } from '@lucide/angular';

@Component({
  selector: 'app-org-create-modal',
  imports: [FormsModule, LucideBuilding2, LucideSparkles, LucideTriangleAlert, LucideX],
  templateUrl: './org-create-modal.html',
})
export class OrgCreateModal {
  readonly isOpen = input<boolean>(false);

  readonly close = output<void>();
  readonly createOrg = output<{ name: string; icon: string }>();

  private readonly nameInputField = viewChild<ElementRef<HTMLInputElement>>('nameInputField');

  readonly nameInput = signal('');
  readonly iconInput = signal('🏢');
  readonly nameError = signal<string | null>(null);

  readonly iconChoices = [
    '🏢', '🚀', '💼', '🌐', '⚡', '🔥',
    '🎯', '📊', '🏗️', '🧩', '🎓', '✨',
    '💻', '💡', '🎨', '⚙️', '🛡️', '🌟',
  ];

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        this.nameInput.set('');
        this.iconInput.set('🏢');
        this.nameError.set(null);
        setTimeout(() => this.nameInputField()?.nativeElement.focus(), 50);
      }
    });
  }

  onSubmit(): void {
    const name = this.nameInput().trim();
    if (!name) {
      this.nameError.set('Vui lòng nhập tên Tổ chức (Organization)!');
      return;
    }
    if (name.length > 50) {
      this.nameError.set('Tên Tổ chức tối đa 50 ký tự!');
      return;
    }
    this.nameError.set(null);

    this.createOrg.emit({
      name,
      icon: this.iconInput().trim() || '🏢',
    });
    this.close.emit();
  }
}
