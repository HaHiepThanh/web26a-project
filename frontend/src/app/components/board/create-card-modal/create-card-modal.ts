import { Component, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CardPriority, User } from '../../../models';
import { LabelPicker } from '../label-picker/label-picker';

@Component({
  selector: 'app-create-card-modal',
  imports: [FormsModule, LabelPicker],
  templateUrl: './create-card-modal.html',
})
export class CreateCardModal {
  readonly isOpen = input<boolean>(false);
  readonly boardId = input.required<string>();
  readonly members = input<User[]>([]);

  readonly close = output<void>();
  readonly create = output<{
    title: string;
    labelIds: string[];
    priority: CardPriority;
    assigneeId: string | null;
    dueDate: string | null;
  }>();

  readonly cardTitle = signal('');
  readonly labelIds = signal<string[]>([]);
  readonly priority = signal<CardPriority>('medium');
  readonly assigneeId = signal<string | null>(null);
  readonly dueDate = signal<string | null>(null);

  readonly priorities: { id: CardPriority; label: string }[] = [
    { id: 'low', label: 'Thấp' },
    { id: 'medium', label: 'Vừa' },
    { id: 'high', label: 'Cao' },
  ];

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        this.cardTitle.set('');
        this.labelIds.set([]);
        this.priority.set('medium');
        this.assigneeId.set(null);
        this.dueDate.set(null);
      }
    });
  }

  onSubmit(): void {
    const title = this.cardTitle().trim();
    if (!title) return;

    this.create.emit({
      title,
      labelIds: this.labelIds(),
      priority: this.priority(),
      assigneeId: this.assigneeId(),
      dueDate: this.dueDate(),
    });
  }
}
