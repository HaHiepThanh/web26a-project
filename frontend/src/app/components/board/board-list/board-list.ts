import { Component, inject, input, output } from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { Card, Label, List, User } from '../../../models';
import { CardService } from '../../../services/card.service';
import { ListService } from '../../../services/list.service';
import { ActivityService } from '../../../services/activity.service';
import { ListHeader } from '../list-header/list-header';
import { CardItem } from '../card-item/card-item';
import { AddCard } from '../add-card/add-card';

/** Một cột (list) trên board: header dính + vùng thẻ tự cuộn dọc riêng (#1) +
 *  cdkDropList để kéo-thả card optimistic (#3). Tất cả board-list nằm trong 1
 *  cdkDropListGroup ở board.ts nên card kéo được cả trong-list lẫn giữa các list. */
@Component({
  selector: 'app-board-list',
  imports: [DragDropModule, ListHeader, CardItem, AddCard],
  templateUrl: './board-list.html',
  styleUrl: './board-list.css',
})
export class BoardList {
  private readonly cardService = inject(CardService);
  private readonly listService = inject(ListService);
  private readonly activityService = inject(ActivityService);

  readonly list = input.required<List>();
  readonly boardId = input.required<string>();
  readonly cards = input<Card[]>([]);
  readonly labelsByCardId = input<Record<string, Label[] | undefined>>({});
  readonly membersById = input<Record<string, User | undefined>>({});
  readonly savingCardIds = input<ReadonlySet<string>>(new Set());
  readonly errorCardIds = input<ReadonlySet<string>>(new Set());
  readonly today = input('');
  /** false khi board đang sắp xếp theo tiêu chí khác "Thủ công" — kéo-thả vẫn
   *  chuyển được thẻ nhưng luôn chèn vào cuối danh sách thật (view sẽ tự sắp lại). */
  readonly sortingEnabled = input(true);
  readonly dimmed = input<ReadonlySet<string>>(new Set());
  readonly highlighted = input<ReadonlySet<string>>(new Set());
  /** Thu gọn danh sách (#9) — trạng thái lưu theo từng user ở board.ts (localStorage). */
  readonly collapsed = input(false);
  /** Chọn nhiều thẻ bằng Shift+click (#12). */
  readonly selectedCardIds = input<ReadonlySet<string>>(new Set());

  readonly renameList = output<string>();
  readonly deleteList = output<void>();
  readonly addCard = output<void>();
  readonly cardClick = output<{ card: Card; shiftKey: boolean }>();
  readonly toggleCollapse = output<void>();

  onCardClick(event: MouseEvent, card: Card): void {
    this.cardClick.emit({ card, shiftKey: event.shiftKey });
  }

  onCardDrop(event: CdkDragDrop<Card[]>): void {
    const card = event.item.data as Card;
    const fromListId = event.previousContainer.id;
    const toListId = event.container.id;
    const targetIndex = this.sortingEnabled() ? event.currentIndex : this.cards().length;
    if (fromListId === toListId && event.previousIndex === event.currentIndex && this.sortingEnabled()) return;
    void this.cardService.moveCardOptimistic(card.id, fromListId, toListId, targetIndex);

    if (fromListId !== toListId) {
      const toName = this.listService.lists().find((l) => l.id === toListId)?.name ?? '—';
      this.activityService.record(this.boardId(), card.id, `đã chuyển thẻ "${card.title}" sang "${toName}"`, 'card_moved');
    }
  }

  trackByCardId(_: number, card: Card): string {
    return card.id;
  }
}
