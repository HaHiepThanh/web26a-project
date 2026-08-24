import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LucideArrowLeft, LucideFolderKanban, LucideListFilter, LucidePin, LucideStar, LucideX, LucideChartLine } from '@lucide/angular';
import { Board, BoardViewer, CardPriority, Label, List, User } from '../../../models';
import { avatarColorFor, initialsOf } from '../../../services/board.service';
import { FLAG_PATH } from '../card-item/card-item';

/** Cùng bảng màu với card-item.ts (PRIORITY_TEXT) — để nút lọc "Mức ưu tiên" khớp
 *  màu với cờ ưu tiên hiển thị trên mặt thẻ, tránh lệch màu giữa 2 nơi. */
const PRIORITY_TEXT: Record<CardPriority, string> = { high: 'text-[#f43f5e]', medium: 'text-[#fb923c]', low: 'text-[#94a3b8]' };
const PRIORITY_ACTIVE: Record<CardPriority, string> = {
  high: 'bg-error text-error-content border-error',
  medium: 'bg-warning text-warning-content border-warning',
  low: 'bg-base-content/70 text-base-100 border-base-content/70',
};

@Component({
  selector: 'app-board-header-bar',
  imports: [RouterLink, FormsModule, LucideArrowLeft, LucideFolderKanban, LucideListFilter, LucidePin, LucideStar, LucideX, LucideChartLine],
  templateUrl: './board-header-bar.html',
})
export class BoardHeaderBar {
  readonly board = input<Board | null>(null);
  /** Ai đang mở board này ngay lúc này (qua WebSocket). */
  readonly viewers = input<BoardViewer[]>([]);
  /** false = mất kết nối realtime → nội dung trên màn hình có thể đã cũ. */
  readonly realtimeConnected = input<boolean>(true);

  readonly avatarColorFor = avatarColorFor;
  readonly initialsOf = initialsOf;

  /** Chỉ vẽ tối đa 4 avatar, còn lại gộp thành "+N" cho khỏi tràn thanh tiêu đề. */
  readonly VIEWERS_SHOWN = 4;

  viewerLabel(v: BoardViewer): string {
    return v.displayName ?? 'Anonymous';
  }
  readonly listsCount = input<number>(0);
  readonly totalCards = input<number>(0);
  readonly viewMode = input<'status' | 'matrix'>('status');
  readonly layoutMode = input<'column' | 'row'>('column');
  readonly isFilteringActive = input<boolean>(false);
  readonly filterMatchCount = input<{ matched: number; total: number }>({ matched: 0, total: 0 });
  readonly showFilterPanel = input<boolean>(false);

  readonly savedFilters = input<any[]>([]);
  readonly savedHighlightGroups = input<any[]>([]);
  readonly activeSavedFilterId = input<string | null>(null);
  readonly activeHighlightGroupId = input<string | null>(null);

  readonly members = input<User[]>([]);
  readonly filterAssigneeIds = input<string[]>([]);
  readonly labels = input<Label[]>([]);
  readonly filterLabelIds = input<string[]>([]);
  readonly filterPriorities = input<CardPriority[]>([]);
  readonly filterDate = input<string | null>(null);

  readonly hasActiveFilter = input<boolean>(false);
  readonly showSaveFilterForm = input<boolean>(false);
  readonly newFilterName = input<string>('');

  readonly priorities: { id: CardPriority; label: string }[] = [
    { id: 'high', label: 'High' },
    { id: 'medium', label: 'Medium' },
    { id: 'low', label: 'Low' },
  ];

  readonly dateOptions = [
    { id: 'overdue', label: 'Overdue' },
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'Next 7 days' },
    { id: 'no_due', label: 'No due date' },
  ];

  readonly UNASSIGNED = '__UNASSIGNED__';
  readonly NO_LABEL = '__NO_LABEL__';
  readonly flagPath = FLAG_PATH;

  priorityTextClass(id: CardPriority): string {
    return PRIORITY_TEXT[id];
  }

  priorityActiveClass(id: CardPriority): string {
    return PRIORITY_ACTIVE[id];
  }

  readonly layoutModeChange = output<'column' | 'row'>();
  readonly openStats = output<void>();
  readonly toggleFilter = output<void>();

  readonly applySavedFilterEvent = output<any>();
  readonly removeSavedFilterEvent = output<{ id: string; event: Event }>();
  readonly applyHighlightGroupEvent = output<any>();
  readonly removeHighlightGroupEvent = output<{ id: string; event: Event }>();

  readonly toggleFilterAssigneeEvent = output<string>();
  readonly toggleFilterLabelEvent = output<string>();
  readonly toggleFilterPriorityEvent = output<CardPriority>();
  readonly toggleFilterDateEvent = output<any>();

  readonly clearFiltersEvent = output<void>();
  readonly openSaveFilterFormEvent = output<void>();
  readonly newFilterNameChange = output<string>();
  readonly saveCurrentFilterEvent = output<void>();
  readonly cancelSaveFilterFormEvent = output<void>();
}
