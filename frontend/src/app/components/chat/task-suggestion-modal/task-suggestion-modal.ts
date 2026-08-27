import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatTaskSuggestion, List, SuggestedCard, SuggestedPriority, User } from '../../../models';
import { ListStore } from '../../../ngrx/list/list.store';
import { BoardStore } from '../../../ngrx/board/board.store';

/** Một dòng trong bảng — thêm cờ `chon` để loại bớt thẻ không muốn tạo. */
interface DongThe extends SuggestedCard {
  chon: boolean;
}

const MUC_UU_TIEN: { id: SuggestedPriority; label: string }[] = [
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
];

/**
 * Modal xem lại gợi ý của AI trước khi tạo thẻ thật.
 *
 * ⚠️ AI đề xuất, NGƯỜI DÙNG quyết định. Mọi trường đều sửa được và bỏ tick được
 *    — model đoán sai tên hay sai người thì sửa tại chỗ, không phải tạo thẻ rồi
 *    vào sửa lại từng cái.
 */
@Component({
  selector: 'app-task-suggestion-modal',
  imports: [FormsModule],
  templateUrl: './task-suggestion-modal.html',
})
export class TaskSuggestionModal {
  private readonly listService = inject(ListStore);
  private readonly boardService = inject(BoardStore);

  readonly suggestion = input.required<ChatTaskSuggestion>();

  readonly close = output<void>();
  readonly confirm = output<SuggestedCard[]>();

  readonly priorities = MUC_UU_TIEN;
  readonly members = this.boardService.members;
  readonly lists = computed<List[]>(() =>
    [...this.listService.lists()].sort((a, b) => a.position - b.position),
  );

  readonly rows = signal<DongThe[]>([]);
  readonly saving = signal(false);

  readonly selectedCount = computed(() => this.rows().filter((r) => r.chon).length);
  /** Thẻ không tên hoặc chưa chọn cột thì không tạo được. */
  readonly canConfirm = computed(
    () =>
      !this.saving() &&
      this.rows().some((r) => r.chon) &&
      this.rows().every((r) => !r.chon || (!!r.title.trim() && !!r.listId)),
  );

  constructor() {
    effect(() => {
      const s = this.suggestion();
      const cotMacDinh = this.lists()[0]?.id;
      this.rows.set(
        s.cards.map((c) => ({
          ...c,
          // Cột do model chọn có thể đã bị xoá giữa chừng — rơi về cột đầu tiên.
          listId: this.lists().some((l) => l.id === c.listId) ? c.listId : cotMacDinh,
          priority: c.priority ?? 'medium',
          chon: true,
        })),
      );
    });
  }

  formatShortName(name: string | null | undefined, max = 15): string {
    if (!name) return '';
    return name.length > max ? name.slice(0, max).trim() + '...' : name;
  }

  patch(index: number, changes: Partial<DongThe>): void {
    this.rows.update((all) => all.map((r, i) => (i === index ? { ...r, ...changes } : r)));
  }

  toggle(index: number): void {
    this.patch(index, { chon: !this.rows()[index].chon });
  }

  onConfirm(): void {
    if (!this.canConfirm()) return;
    this.saving.set(true);
    this.confirm.emit(
      this.rows()
        .filter((r) => r.chon)
        .map(({ chon: _bo, ...card }) => ({
          ...card,
          title: card.title.trim(),
          // Chuỗi rỗng từ ô input phải thành `undefined`, nếu không backend nhận
          // dueDate="" rồi trả 400 vì không khớp định dạng ngày.
          description: card.description?.trim() || undefined,
          assigneeId: card.assigneeId || undefined,
          dueDate: card.dueDate || undefined,
        })),
    );
  }
}
