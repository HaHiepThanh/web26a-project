import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CdkDragDrop, CdkDragEnd, DragDropModule } from '@angular/cdk/drag-drop';
import { Card, CardPriority, Label, List, User } from '../../models';
import { BoardService } from '../../services/board.service';
import { ListService } from '../../services/list.service';
import { CardService } from '../../services/card.service';
import { LabelService } from '../../services/label.service';
import { ActivityService } from '../../services/activity.service';
import { BoardList } from '../../components/board/board-list/board-list';
import { AddList } from '../../components/board/add-list/add-list';
import { LabelPicker } from '../../components/board/label-picker/label-picker';
import { CardItem } from '../../components/board/card-item/card-item';
import { ChatPanel } from '../../components/chat/chat-panel/chat-panel';
import { CardDetailModal } from '../../components/board/card-detail-modal/card-detail-modal';

type ToastType = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  message: string;
  type: ToastType;
}
type SortMode = 'manual' | 'priority' | 'due' | 'new';
type ViewMode = 'status' | 'matrix';
type DateFilter = 'overdue' | 'today' | 'week';
/** Kích thước ô lưới fallback cho thẻ chưa từng được kéo trên canvas "2 chiều" (#6). */
const CANVAS_FALLBACK_COL_WIDTH = 300;
const CANVAS_FALLBACK_ROW_HEIGHT = 140;
const CANVAS_FALLBACK_COLS = 5;
const CANVAS_CARD_WIDTH = 272;
/** Sentinel cho "Chưa gán ai" / "Chưa có nhãn nào" trong bộ lọc (#7). */
const UNASSIGNED = '__unassigned__';
const NO_LABEL = '__no_label__';

interface SavedFilter {
  id: string;
  name: string;
  assigneeIds: string[];
  labelIds: string[];
  priorities: CardPriority[];
  date: DateFilter | null;
}

/** Bộ highlight chọn tay (không theo tiêu chí) — Shift+click chọn thẻ (#12) rồi lưu
 *  thành chip, bấm lại là highlight đúng những thẻ đó theo id, không phải theo điều kiện. */
interface SavedHighlightGroup {
  id: string;
  name: string;
  cardIds: string[];
}

const LIST_COLORS = ['#64748b', '#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626'];
const PRIORITIES: { id: CardPriority; label: string }[] = [
  { id: 'cao', label: 'Cao' },
  { id: 'trung', label: 'Trung bình' },
  { id: 'thap', label: 'Thấp' },
];
const PRIORITY_RANK: Record<CardPriority, number> = { cao: 0, trung: 1, thap: 2 };
const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: 'manual', label: 'Sắp xếp: Thủ công' },
  { id: 'priority', label: 'Sắp xếp: Mức ưu tiên' },
  { id: 'due', label: 'Sắp xếp: Hạn chót' },
  { id: 'new', label: 'Sắp xếp: Mới tạo' },
];
const DATE_OPTIONS: { id: DateFilter; label: string }[] = [
  { id: 'overdue', label: 'Quá hạn' },
  { id: 'today', label: 'Hôm nay' },
  { id: 'week', label: 'Tuần này' },
];

/**
 * Màn Trello chính. Lớp 🔴: #1 cuộn ngang không rớt dòng, #2 tự tạo list/thẻ,
 * #3 optimistic drag-drop. Lớp 🟠: #4 mức ưu tiên đầy đủ, #5 nhiều nhãn + tự tạo nhãn.
 * Dữ liệu qua ListService/CardService/LabelService/BoardService — hiện là mock tại
 * chỗ (chưa nối backend thật), optimistic update + rollback qua MockNetworkService
 * khi kéo-thả.
 */
@Component({
  selector: 'app-board',
  imports: [FormsModule, RouterLink, DragDropModule, BoardList, AddList, LabelPicker, CardItem, ChatPanel, CardDetailModal],
  templateUrl: './board.html',
  styleUrl: './board.css',
})
export class Board {
  private readonly route = inject(ActivatedRoute);
  private readonly boardService = inject(BoardService);
  private readonly listService = inject(ListService);
  private readonly cardService = inject(CardService);
  private readonly labelService = inject(LabelService);
  private readonly activityService = inject(ActivityService);

  readonly boardId = this.route.snapshot.paramMap.get('id') ?? 'demo-board';

  readonly board = this.boardService.currentBoard;
  readonly members = this.boardService.members;
  readonly lists = computed(() => [...this.listService.lists()].sort((a, b) => a.position - b.position));
  readonly cardsByList = this.cardService.cardsByList;
  readonly savingCardIds = this.cardService.savingCardIds;
  readonly errorCardIds = this.cardService.errorCardIds;
  readonly labels = this.labelService.labels;

  readonly today = new Date().toISOString().slice(0, 10);
  readonly listColors = LIST_COLORS;
  readonly priorities = PRIORITIES;
  readonly sortOptions = SORT_OPTIONS;
  readonly sortMode = signal<SortMode>('manual');

  // ---- Nhắc deadline — Mức 1 (#10): banner khi mở board, không cron job/email/push ----
  readonly myDueCounts = this.cardService.myDueCounts;
  readonly dueBannerDismissed = signal(false);
  readonly showDueBanner = computed(() => {
    const c = this.myDueCounts();
    return !this.dueBannerDismissed() && c.overdue + c.dueSoon > 0;
  });

  dismissDueBanner(): void {
    this.dueBannerDismissed.set(true);
  }

  // ---- Thu gọn danh sách (#9) — lưu theo user ở localStorage, không cần cột DB mới ----
  readonly collapsedListIds = signal<Set<string>>(new Set());

  private collapsedListsKey(): string {
    return `trello_collapsed_lists_${this.boardId}`;
  }

  private loadCollapsedLists(): void {
    try {
      const raw = localStorage.getItem(this.collapsedListsKey());
      this.collapsedListIds.set(raw ? new Set(JSON.parse(raw) as string[]) : new Set());
    } catch {
      this.collapsedListIds.set(new Set());
    }
  }

  toggleListCollapse(listId: string): void {
    this.collapsedListIds.update((set) => {
      const next = new Set(set);
      if (next.has(listId)) next.delete(listId);
      else next.add(listId);
      localStorage.setItem(this.collapsedListsKey(), JSON.stringify([...next]));
      return next;
    });
  }

  // ---- Board 2 chiều (#6): canvas tự do, thẻ kéo tới đâu nằm đó, không gắn
  // với trạng thái (list) hay mức ưu tiên nữa — 2 trục = vị trí ngang/dọc của
  // chính thẻ đó (canvasX/canvasY trên Card), độc lập với chế độ "Theo trạng thái". ----
  readonly viewMode = signal<ViewMode>('status');

  // ---- Lọc board — highlight/làm mờ (#7) ----
  readonly UNASSIGNED = UNASSIGNED;
  readonly NO_LABEL = NO_LABEL;
  readonly dateOptions = DATE_OPTIONS;
  readonly showFilterPanel = signal(false);
  readonly filterAssigneeIds = signal<string[]>([]);
  readonly filterLabelIds = signal<string[]>([]);
  readonly filterPriorities = signal<CardPriority[]>([]);
  readonly filterDate = signal<DateFilter | null>(null);
  readonly savedFilters = signal<SavedFilter[]>([]);
  readonly activeSavedFilterId = signal<string | null>(null);
  readonly showSaveFilterForm = signal(false);
  readonly newFilterName = signal('');

  // Bộ highlight chọn tay theo id thẻ (khác bộ lọc theo tiêu chí ở trên) — 2 loại chip
  // không dùng chung 1 lúc: bật cái này sẽ tắt cái kia, và ngược lại.
  readonly savedHighlightGroups = signal<SavedHighlightGroup[]>([]);
  readonly activeHighlightGroupId = signal<string | null>(null);

  readonly hasActiveFilter = computed(
    () => this.filterAssigneeIds().length > 0 || this.filterLabelIds().length > 0 || this.filterPriorities().length > 0 || this.filterDate() !== null,
  );

  private matchesFilter(card: Card): boolean {
    const asg = this.filterAssigneeIds();
    if (asg.length && !asg.includes(card.assigneeId ?? UNASSIGNED)) return false;

    const lbl = this.filterLabelIds();
    if (lbl.length) {
      const cardLabelIds = this.labelService.cardLabelIds()[card.id] ?? [];
      const ok = cardLabelIds.length === 0 ? lbl.includes(NO_LABEL) : cardLabelIds.some((id) => lbl.includes(id));
      if (!ok) return false;
    }

    const pri = this.filterPriorities();
    if (pri.length && !pri.includes(card.priority)) return false;

    const date = this.filterDate();
    if (date && !this.matchesDate(card, date)) return false;

    return true;
  }

  private matchesDate(card: Card, mode: DateFilter): boolean {
    if (!card.dueDate) return false;
    if (mode === 'overdue') return card.dueDate < this.today;
    if (mode === 'today') return card.dueDate === this.today;
    const start = new Date(this.today);
    const end = new Date(this.today);
    end.setDate(end.getDate() + 6);
    const due = new Date(card.dueDate);
    return due >= start && due <= end;
  }

  private allCards(): Card[] {
    return Object.values(this.cardsByList()).flat();
  }

  private activeHighlightGroup(): SavedHighlightGroup | null {
    const id = this.activeHighlightGroupId();
    if (!id) return null;
    return this.savedHighlightGroups().find((g) => g.id === id) ?? null;
  }

  readonly highlightedCardIds = computed(() => {
    const group = this.activeHighlightGroup();
    if (group) return new Set(group.cardIds);
    if (!this.hasActiveFilter()) return new Set<string>();
    const set = new Set<string>();
    for (const c of this.allCards()) if (this.matchesFilter(c)) set.add(c.id);
    return set;
  });

  readonly dimmedCardIds = computed(() => {
    const group = this.activeHighlightGroup();
    if (group) {
      const keep = new Set(group.cardIds);
      const set = new Set<string>();
      for (const c of this.allCards()) if (!keep.has(c.id)) set.add(c.id);
      return set;
    }
    if (!this.hasActiveFilter()) return new Set<string>();
    const set = new Set<string>();
    for (const c of this.allCards()) if (!this.matchesFilter(c)) set.add(c.id);
    return set;
  });

  readonly filterMatchCount = computed(() => {
    const total = this.totalCards();
    if (this.activeHighlightGroup()) return { matched: this.highlightedCardIds().size, total };
    const matched = this.hasActiveFilter() ? this.highlightedCardIds().size : total;
    return { matched, total };
  });

  readonly isFilteringActive = computed(() => this.hasActiveFilter() || this.activeHighlightGroupId() !== null);

  toggleFilterPanel(): void {
    this.showFilterPanel.update((v) => !v);
  }

  toggleFilterAssignee(id: string): void {
    this.filterAssigneeIds.update((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));
    this.activeSavedFilterId.set(null);
    this.activeHighlightGroupId.set(null);
  }

  toggleFilterLabel(id: string): void {
    this.filterLabelIds.update((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));
    this.activeSavedFilterId.set(null);
    this.activeHighlightGroupId.set(null);
  }

  toggleFilterPriority(p: CardPriority): void {
    this.filterPriorities.update((arr) => (arr.includes(p) ? arr.filter((x) => x !== p) : [...arr, p]));
    this.activeSavedFilterId.set(null);
    this.activeHighlightGroupId.set(null);
  }

  toggleFilterDate(d: DateFilter): void {
    this.filterDate.update((cur) => (cur === d ? null : d));
    this.activeSavedFilterId.set(null);
    this.activeHighlightGroupId.set(null);
  }

  private clearCriteriaFilters(): void {
    this.filterAssigneeIds.set([]);
    this.filterLabelIds.set([]);
    this.filterPriorities.set([]);
    this.filterDate.set(null);
    this.activeSavedFilterId.set(null);
  }

  clearFilters(): void {
    this.clearCriteriaFilters();
    this.activeHighlightGroupId.set(null);
  }

  private savedFiltersKey(): string {
    return `trello_saved_filters_${this.boardId}`;
  }

  private loadSavedFilters(): void {
    try {
      const raw = localStorage.getItem(this.savedFiltersKey());
      this.savedFilters.set(raw ? (JSON.parse(raw) as SavedFilter[]) : []);
    } catch {
      this.savedFilters.set([]);
    }
  }

  private persistSavedFilters(): void {
    localStorage.setItem(this.savedFiltersKey(), JSON.stringify(this.savedFilters()));
  }

  openSaveFilterForm(): void {
    this.newFilterName.set('');
    this.showSaveFilterForm.set(true);
  }

  cancelSaveFilterForm(): void {
    this.showSaveFilterForm.set(false);
  }

  saveCurrentFilter(): void {
    const name = this.newFilterName().trim();
    if (!name) return;
    const filter: SavedFilter = {
      id: `f-${Date.now()}`,
      name,
      assigneeIds: this.filterAssigneeIds(),
      labelIds: this.filterLabelIds(),
      priorities: this.filterPriorities(),
      date: this.filterDate(),
    };
    this.savedFilters.update((all) => [...all, filter]);
    this.persistSavedFilters();
    this.activeSavedFilterId.set(filter.id);
    this.showSaveFilterForm.set(false);
  }

  applySavedFilter(f: SavedFilter): void {
    this.filterAssigneeIds.set(f.assigneeIds);
    this.filterLabelIds.set(f.labelIds);
    this.filterPriorities.set(f.priorities);
    this.filterDate.set(f.date);
    this.activeSavedFilterId.set(f.id);
    this.activeHighlightGroupId.set(null);
  }

  removeSavedFilter(id: string, event: Event): void {
    event.stopPropagation();
    this.savedFilters.update((all) => all.filter((f) => f.id !== id));
    this.persistSavedFilters();
    if (this.activeSavedFilterId() === id) this.activeSavedFilterId.set(null);
  }

  private savedHighlightGroupsKey(): string {
    return `trello_saved_highlight_groups_${this.boardId}`;
  }

  private loadSavedHighlightGroups(): void {
    try {
      const raw = localStorage.getItem(this.savedHighlightGroupsKey());
      this.savedHighlightGroups.set(raw ? (JSON.parse(raw) as SavedHighlightGroup[]) : []);
    } catch {
      this.savedHighlightGroups.set([]);
    }
  }

  private persistSavedHighlightGroups(): void {
    localStorage.setItem(this.savedHighlightGroupsKey(), JSON.stringify(this.savedHighlightGroups()));
  }

  /** Lưu đúng bộ thẻ đang chọn tay (Shift+click, #12) thành 1 chip highlight mới. */
  saveSelectionAsHighlightGroup(): void {
    const cardIds = [...this.selectedCardIds()];
    if (!cardIds.length) return;
    const name = window.prompt('Đặt tên cho bộ highlight này:');
    if (!name?.trim()) return;
    const group: SavedHighlightGroup = { id: `hg-${Date.now()}`, name: name.trim(), cardIds };
    this.savedHighlightGroups.update((all) => [...all, group]);
    this.persistSavedHighlightGroups();
    this.clearSelection();
    this.addToast(`Đã lưu bộ highlight "${group.name}" (${cardIds.length} thẻ).`, 'success');
  }

  applyHighlightGroup(g: SavedHighlightGroup): void {
    this.clearCriteriaFilters();
    this.activeHighlightGroupId.set(g.id);
  }

  removeHighlightGroup(id: string, event: Event): void {
    event.stopPropagation();
    this.savedHighlightGroups.update((all) => all.filter((g) => g.id !== id));
    this.persistSavedHighlightGroups();
    if (this.activeHighlightGroupId() === id) this.activeHighlightGroupId.set(null);
  }

  // Record<string, T | undefined> (thay vì Record<string, T>) vì tsconfig chưa bật
  // noUncheckedIndexedAccess — khai báo rõ để template `?? null` không bị NG8102 cảnh báo nhầm.
  readonly membersById = computed(() => {
    const map: Record<string, User | undefined> = {};
    for (const m of this.members()) map[m.id] = m;
    return map;
  });

  readonly labelsByCardId = computed(() => {
    const cardLabelIds = this.labelService.cardLabelIds();
    const labelById: Record<string, Label | undefined> = {};
    for (const l of this.labels()) labelById[l.id] = l;
    const result: Record<string, Label[] | undefined> = {};
    for (const [cardId, labelIds] of Object.entries(cardLabelIds)) {
      const found = labelIds.map((id) => labelById[id]).filter((l): l is Label => !!l);
      if (found.length) result[cardId] = found;
    }
    return result;
  });

  readonly totalCards = computed(() => Object.values(this.cardsByList()).reduce((sum, arr) => sum + arr.length, 0));

  constructor() {
    void this.bootstrap();
    this.loadSavedFilters();
    this.loadSavedHighlightGroups();
    this.loadCollapsedLists();

    effect(() => {
      const err = this.listService.lastError();
      if (err) this.addToast(err.message, 'error');
    });
    effect(() => {
      const err = this.cardService.lastError();
      if (err) this.addToast(err.message, 'error');
    });
  }

  private async bootstrap(): Promise<void> {
    await this.boardService.loadBoard(this.boardId);
    await this.labelService.loadLabels(this.boardId);
    await this.listService.loadLists(this.boardId);
    const listIds = this.lists().map((l) => l.id);
    await this.cardService.loadCards(this.boardId, listIds);
  }

  /** Thẻ của 1 list, đã áp sắp xếp hiển thị (#thứ tự lưu thật không đổi trừ khi kéo-thả thủ công). */
  cardsFor(listId: string): Card[] {
    const cards = this.cardsByList()[listId] ?? [];
    const mode = this.sortMode();
    if (mode === 'manual') return cards;
    const sorted = [...cards];
    if (mode === 'priority') sorted.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
    else if (mode === 'due') sorted.sort((a, b) => (a.dueDate ? Date.parse(a.dueDate) : Infinity) - (b.dueDate ? Date.parse(b.dueDate) : Infinity));
    else if (mode === 'new') sorted.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return sorted;
  }

  trackByListId(_: number, list: List): string {
    return list.id;
  }

  // ---- Board 2 chiều (#6): canvas tự do — vị trí ngang/dọc của chính thẻ, không
  // gắn với list hay priority. Thẻ chưa từng kéo dùng vị trí lưới fallback theo
  // thứ tự (để không chồng lên nhau khi mới chuyển sang chế độ này). ----
  readonly cardsForCanvas = computed(() => {
    return this.allCards().map((card, i) => {
      const x = card.canvasX ?? (i % CANVAS_FALLBACK_COLS) * CANVAS_FALLBACK_COL_WIDTH + 20;
      const y = card.canvasY ?? Math.floor(i / CANVAS_FALLBACK_COLS) * CANVAS_FALLBACK_ROW_HEIGHT + 20;
      return { card, x, y };
    });
  });

  readonly canvasWidth = computed(() => Math.max(CANVAS_FALLBACK_COLS * CANVAS_FALLBACK_COL_WIDTH + 40, 2400));
  readonly canvasHeight = computed(() => {
    const rows = Math.ceil(Math.max(this.allCards().length, 1) / CANVAS_FALLBACK_COLS);
    return Math.max(rows * CANVAS_FALLBACK_ROW_HEIGHT + 200, 1400);
  });

  readonly canvasCardWidth = CANVAS_CARD_WIDTH;

  /** Kéo tự do trên canvas kết thúc: lưu đúng vị trí ngang/dọc mới của thẻ đó. */
  onCanvasCardDragEnded(event: CdkDragEnd, card: Card, currentX: number, currentY: number): void {
    const { x: dx, y: dy } = event.distance;
    if (dx === 0 && dy === 0) return;
    void this.cardService.moveCardCanvasPosition(card.id, currentX + dx, currentY + dy);
  }

  private listNameFor(listId: string): string {
    return this.lists().find((l) => l.id === listId)?.name ?? '—';
  }

  // ---- Kéo-thả đổi thứ tự cột (#3) ----
  onListDrop(event: CdkDragDrop<List[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const ordered = [...this.lists()];
    const [moved] = ordered.splice(event.previousIndex, 1);
    ordered.splice(event.currentIndex, 0, moved);
    void this.listService.reorderListOptimistic(ordered.map((l) => l.id));
  }

  // ---- Modal tạo danh sách (#2) ----
  readonly showListModal = signal(false);
  readonly newListName = signal('');
  readonly newListColor = signal(LIST_COLORS[0]);

  openListModal(): void {
    this.newListName.set('');
    this.newListColor.set(LIST_COLORS[0]);
    this.showListModal.set(true);
  }

  closeListModal(): void {
    this.showListModal.set(false);
  }

  async submitListModal(): Promise<void> {
    const name = this.newListName().trim();
    if (!name) return;
    await this.listService.createList(this.boardId, name, this.newListColor());
    this.closeListModal();
  }

  // ---- Modal tạo thẻ (#2, #4, #5) ----
  readonly showCardModal = signal(false);
  readonly targetListId = signal<string | null>(null);
  readonly newCardTitle = signal('');
  readonly newCardPriority = signal<CardPriority>('trung');
  readonly newCardAssigneeId = signal<string | null>(null);
  readonly newCardDue = signal('');
  readonly newCardLabelIds = signal<string[]>([]);

  openCardModal(listId: string): void {
    this.targetListId.set(listId);
    this.newCardTitle.set('');
    this.newCardPriority.set('trung');
    this.newCardAssigneeId.set(null);
    this.newCardDue.set('');
    this.newCardLabelIds.set([]);
    this.showCardModal.set(true);
  }

  closeCardModal(): void {
    this.showCardModal.set(false);
  }

  async submitCardModal(): Promise<void> {
    const listId = this.targetListId();
    const title = this.newCardTitle().trim();
    if (!listId || !title) return;

    const card = await this.cardService.createCard(listId, {
      title,
      priority: this.newCardPriority(),
      assigneeId: this.newCardAssigneeId() ?? undefined,
      dueDate: this.newCardDue() || undefined,
    });
    if (card && this.newCardLabelIds().length) {
      this.labelService.setCardLabels(card.id, this.newCardLabelIds());
    }
    if (card) this.activityService.record(this.boardId, card.id, 'đã tạo thẻ này');
    this.closeCardModal();
  }

  // ---- Xoá / đổi tên danh sách ----
  requestDeleteList(list: List): void {
    const count = this.cardsFor(list.id).length;
    const message = count > 0 ? `Danh sách "${list.name}" còn ${count} thẻ bên trong — xoá luôn cả thẻ?` : `Xoá danh sách "${list.name}"?`;
    if (!window.confirm(message)) return;
    this.cardService.clearListCards(list.id);
    void this.listService.deleteList(list.id);
  }

  renameList(list: List, name: string): void {
    void this.listService.renameList(list.id, name);
  }

  // ---- Chat panel + AI detect-task (#8) ----
  onChatTaskCreated(title: string): void {
    this.addToast(`AI đã tạo thẻ "${title}" từ tin nhắn chat.`, 'success');
  }

  // ---- Modal chi tiết thẻ (appRequirement #4) ----
  // Lưu id chứ không lưu cả Card — để selectedCard() luôn đọc lại bản mới nhất từ
  // CardService sau khi sửa trong modal (nếu lưu snapshot Card, sửa xong modal sẽ hiện dữ liệu cũ).
  private readonly selectedCardId = signal<string | null>(null);
  readonly selectedCard = computed(() => {
    const id = this.selectedCardId();
    if (!id) return null;
    return this.allCards().find((c) => c.id === id) ?? null;
  });

  openCardDetail(card: Card): void {
    this.selectedCardId.set(card.id);
  }

  closeCardDetail(): void {
    this.selectedCardId.set(null);
  }

  onCardDetailDeleted(): void {
    const title = this.selectedCard()?.title;
    this.closeCardDetail();
    if (title) this.addToast(`Đã xoá thẻ "${title}".`, 'info');
  }

  // ---- Chọn nhiều thẻ (#12) — Shift+click, thanh hành động hàng loạt ----
  readonly selectedCardIds = signal<ReadonlySet<string>>(new Set());
  readonly showBulkLabelPicker = signal(false);

  /** Click thường mở chi tiết thẻ; Shift+click (hoặc click khi đang chọn dở) bật/tắt chọn thẻ đó. */
  onCardActivate(card: Card, shiftKey: boolean): void {
    if (shiftKey || this.selectedCardIds().size > 0) {
      this.toggleCardSelection(card.id);
    } else {
      this.openCardDetail(card);
    }
  }

  private toggleCardSelection(cardId: string): void {
    this.selectedCardIds.update((set) => {
      const next = new Set(set);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  clearSelection(): void {
    this.selectedCardIds.set(new Set());
    this.showBulkLabelPicker.set(false);
  }

  onBulkMoveSelect(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const toListId = select.value;
    select.value = '';
    if (!toListId) return;

    const ids = [...this.selectedCardIds()];
    for (const cardId of ids) {
      const card = this.allCards().find((c) => c.id === cardId);
      if (!card || card.listId === toListId) continue;
      void this.cardService.moveCardOptimistic(cardId, card.listId, toListId, this.cardsFor(toListId).length);
    }
    this.addToast(`Đã chuyển ${ids.length} thẻ sang "${this.listNameFor(toListId)}".`, 'success');
    this.clearSelection();
  }

  toggleBulkLabelPicker(): void {
    this.showBulkLabelPicker.update((v) => !v);
  }

  applyBulkLabel(labelId: string): void {
    const ids = [...this.selectedCardIds()];
    for (const cardId of ids) void this.labelService.attachLabel(cardId, labelId);
    this.addToast(`Đã gắn nhãn cho ${ids.length} thẻ.`, 'success');
    this.clearSelection();
  }

  bulkDelete(): void {
    const ids = [...this.selectedCardIds()];
    if (!window.confirm(`Xoá ${ids.length} thẻ đã chọn? Không thể hoàn tác.`)) return;
    for (const cardId of ids) {
      const card = this.allCards().find((c) => c.id === cardId);
      if (card) void this.cardService.deleteCard(cardId, card.listId);
    }
    this.addToast(`Đã xoá ${ids.length} thẻ.`, 'info');
    this.clearSelection();
  }

  // ---- Toasts ----
  private toastSeq = 0;
  readonly toasts = signal<Toast[]>([]);

  private addToast(message: string, type: ToastType = 'info'): void {
    const id = ++this.toastSeq;
    this.toasts.update((list) => [...list, { id, message, type }]);
    setTimeout(() => {
      this.toasts.update((list) => list.filter((t) => t.id !== id));
    }, 3200);
  }
}
