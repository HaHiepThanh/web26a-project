import { Component, input, output } from '@angular/core';
import { TaskSuggestion } from '../../../models';

/** Thẻ gợi ý task do AI phát hiện trong chat (#8) — cần user bấm xác nhận mới tạo card thật. */
@Component({
  selector: 'app-task-suggestion-card',
  imports: [],
  templateUrl: './task-suggestion-card.html',
  styleUrl: './task-suggestion-card.css',
})
export class TaskSuggestionCard {
  readonly suggestion = input.required<TaskSuggestion>();
  readonly assigneeName = input<string | null>(null);

  readonly confirm = output<void>();
  readonly dismiss = output<void>();
}
