import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Board, CardPriority, Label, List, User } from '../../../models';

@Component({
  selector: 'app-board-header-bar',
  imports: [RouterLink, FormsModule],
  templateUrl: './board-header-bar.html',
})
export class BoardHeaderBar {
  readonly board = input<Board | null>(null);
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
    { id: 'high', label: 'Cao' },
    { id: 'medium', label: 'Vừa' },
    { id: 'low', label: 'Thấp' },
  ];

  readonly dateOptions = [
    { id: 'overdue', label: 'Đã quá hạn' },
    { id: 'today', label: 'Hôm nay' },
    { id: 'week', label: 'Trong 7 ngày tới' },
    { id: 'no_due', label: 'Không có ngày' },
  ];

  readonly UNASSIGNED = '__UNASSIGNED__';
  readonly NO_LABEL = '__NO_LABEL__';

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
