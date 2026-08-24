import { Component, computed, input, output } from '@angular/core';
import { ChatTaskSuggestion, User } from '../../../models';

/**
 * Chip "AI đề xuất tạo thẻ" nằm ngay dưới tin nhắn sinh ra nó.
 *
 * Chỉ TÓM TẮT — bấm "Xem & tạo" mới mở modal để xem đầy đủ và sửa. Nhét cả bảng
 * chỉnh sửa vào khung chat rộng 300px thì không đọc nổi.
 */
@Component({
  selector: 'app-task-suggestion-card',
  imports: [],
  templateUrl: './task-suggestion-card.html',
  styleUrl: './task-suggestion-card.css',
})
export class TaskSuggestionCard {
  readonly suggestion = input.required<ChatTaskSuggestion>();
  /** Roster board — để đổi assigneeId thành tên người thật. */
  readonly members = input<User[]>([]);

  readonly open = output<void>();
  readonly dismiss = output<void>();

  private readonly nameById = computed(() => {
    const map: Record<string, string | undefined> = {};
    for (const m of this.members()) map[m.id] = m.displayName || m.email;
    return map;
  });

  /** Mỗi thẻ một dòng tóm tắt: tên · người phụ trách · hạn. */
  readonly lines = computed(() =>
    this.suggestion().cards.map((c) => ({
      title: c.title,
      assignee: c.assigneeId ? (this.nameById()[c.assigneeId] ?? 'Someone') : null,
      dueDate: c.dueDate ?? null,
    })),
  );

  readonly count = computed(() => this.suggestion().cards.length);
}
