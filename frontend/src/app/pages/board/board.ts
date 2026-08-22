import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import {
  Card,
  CardPriority,
  Label,
  List,
  MinimapListGeom,
  Toast,
  ToastType,
  User,
} from '../../models';
import { BoardService } from '../../services/board.service';
import { ListService } from '../../services/list.service';
import { CardService } from '../../services/card.service';
import { LabelService } from '../../services/label.service';
import { ActivityService } from '../../services/activity.service';
import { ChecklistService } from '../../services/checklist.service';
import { CommentService } from '../../services/comment.service';
import { AttachmentService } from '../../services/attachment.service';
import { RealtimeService } from '../../services/realtime.service';
import { BoardList } from '../../components/board/board-list/board-list';
import { AddList } from '../../components/board/add-list/add-list';
import { LabelPicker } from '../../components/board/label-picker/label-picker';
import { CardItem } from '../../components/board/card-item/card-item';
import { ChatPanel } from '../../components/chat/chat-panel/chat-panel';
import { CardDetailModal } from '../../components/board/card-detail-modal/card-detail-modal';
import { BoardMinimap } from '../../components/board/board-minimap/board-minimap';
import { WorkspaceStatsModal } from '../../components/board/workspace-stats-modal/workspace-stats-modal';
import { BoardHeaderBar } from '../../components/board/board-header-bar/board-header-bar';
import { BoardBulkActions } from '../../components/board/board-bulk-actions/board-bulk-actions';

type SortMode = 'manual' | 'priority' | 'due' | 'new';
type ViewMode = 'status' | 'matrix';
/** Row View (#14): cách trình bày khác của view "Theo trạng thái" — Lists xếp
 *  dọc, Cards trong mỗi List xếp ngang. Không phải 1 grouping mới (khác matrix). */
type LayoutMode = 'column' | 'row';
type DateFilter = 'overdue' | 'today' | 'week';
/** Ký tự nối listId + priority thành 1 id cdkDropList duy nhất cho từng ô swimlane (#6). */
const CELL_SEP = '__';
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

const PRIORITIES: { id: CardPriority; label: string }[] = [
  { id: 'high', label: 'Cao' },
  { id: 'medium', label: 'Trung bình' },
  { id: 'low', label: 'Thấp' },
];
const PRIORITY_RANK: Record<CardPriority, number> = { high: 0, medium: 1, low: 2 };
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
/** Mini Map (#13) chỉ hiện khi board đủ "lớn": nhiều list hoặc nội dung tràn viewport. */
const MINIMAP_LIST_COUNT_THRESHOLD = 8;
const MINIMAP_OVERFLOW_RATIO = 1.5;

/**
 * Màn Trello chính. Lớp 🔴: #1 cuộn ngang không rớt dòng, #2 tự tạo list/thẻ,
 * #3 optimistic drag-drop. Lớp 🟠: #4 mức ưu tiên đầy đủ, #5 nhiều nhãn + tự tạo nhãn.
 * Dữ liệu qua ListService/CardService/LabelService/BoardService — hiện là mock tại
 * chỗ (chưa nối backend thật), optimistic update + rollback qua MockNetworkService
 * khi kéo-thả.
 */
@Component({
  selector: 'app-board',
  imports: [
    FormsModule,
    DragDropModule,
    BoardList,
    AddList,
    CardItem,
    ChatPanel,
    CardDetailModal,
    BoardMinimap,
    WorkspaceStatsModal,
    BoardHeaderBar,
    BoardBulkActions,
  ],
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
  private readonly checklistService = inject(ChecklistService);
  private readonly commentService = inject(CommentService);
  private readonly attachmentService = inject(AttachmentService);
  private readonly realtime = inject(RealtimeService);
  private readonly router = inject(Router);

  readonly boardId = this.route.snapshot.paramMap.get('id') ?? 'demo-board';

  readonly board = this.boardService.currentBoard;
  /** Màu nền trang chọn lúc tạo board (Workspace) — không có thì giữ nền xám mặc định
   *  (board demo cũ). Nền màu để trang Board + danh sách nổi bật hơn, không bị chìm. */
  readonly pageBgClass = computed(() => (this.board()?.backgroundImageUrl ? 'bg-base-200' : this.board()?.background ?? 'bg-base-200'));
  /** Ảnh nền tuỳ chọn chọn lúc tạo board — có thì ưu tiên hơn màu nền `pageBgClass`. */
  readonly pageBgImageUrl = computed(() => this.board()?.backgroundImageUrl ?? null);
  readonly members = this.boardService.members;
  readonly lists = computed(() => [...this.listService.lists()].sort((a, b) => a.position - b.position));
  readonly cardsByList = this.cardService.cardsByList;
  readonly savingCardIds = this.cardService.savingCardIds;
  readonly errorCardIds = this.cardService.errorCardIds;
  readonly labels = this.labelService.labels;
  /** [BONUS #4] done/total checklist + số bình luận theo card — cho badge ở mặt thẻ. */
  readonly checklistProgressByCardId = this.checklistService.progressByCard;
  readonly commentCountByCardId = this.commentService.countByCard;
  readonly coverUrlByCardId = this.attachmentService.coverUrlByCard;

  readonly today = new Date().toISOString().slice(0, 10);
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

  // ---- Board 2 chiều (#6) ----
  readonly viewMode = signal<ViewMode>('status');
  readonly gridCols = computed(() => `repeat(${Math.max(this.lists().length, 1)}, 272px)`);

  // ---- Row View (#14): Lists xếp dọc, Cards xếp ngang — chỉ áp dụng cho view "Theo trạng thái" ----
  readonly layoutMode = signal<LayoutMode>('column');

  private layoutModeKey(): string {
    return `trello_layout_mode_${this.boardId}`;
  }

  private loadLayoutMode(): void {
    const raw = localStorage.getItem(this.layoutModeKey());
    this.layoutMode.set(raw === 'row' ? 'row' : 'column');
  }

  setLayoutMode(mode: LayoutMode): void {
    this.layoutMode.set(mode);
    localStorage.setItem(this.layoutModeKey(), mode);
  }

  // ---- Modal "Thống kê & Báo cáo" (Workspace Stats thu gọn cho riêng board này) ----
  readonly showStatsModal = signal(false);

  openStatsModal(): void {
    this.showStatsModal.set(true);
  }

  closeStatsModal(): void {
    this.showStatsModal.set(false);
  }

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

  // ---- Mini Map (#13): thanh điều hướng thu nhỏ nổi góc dưới-phải, chỉ hiện khi
  // board "lớn" ở chế độ Theo trạng thái. Đo trực tiếp từ DOM khung cuộn ngang thật
  // (không hardcode lại hằng số layout), Mini Map chỉ vẽ lại từ số liệu đo được. ----
  private readonly boardScrollRef = viewChild<ElementRef<HTMLDivElement>>('boardScroll');

  readonly minimapItems = signal<MinimapListGeom[]>([]);
  readonly minimapScrollPos = signal(0);
  readonly minimapViewportSize = signal(0);
  readonly minimapContentSize = signal(0);

  readonly showMinimap = computed(() => {
    if (this.viewMode() !== 'status') return false;
    const count = this.lists().length;
    if (count === 0) return false;
    if (count >= MINIMAP_LIST_COUNT_THRESHOLD) return true;
    const viewport = this.minimapViewportSize();
    if (viewport <= 0) return false;
    return this.minimapContentSize() > viewport * MINIMAP_OVERFLOW_RATIO;
  });

  private minimapResizeObserver?: ResizeObserver;
  private minimapScrollRaf = 0;

  private setupMinimapTracking(): void {
    effect(() => {
      const el = this.boardScrollRef()?.nativeElement;
      this.minimapResizeObserver?.disconnect();
      if (!el) return;
      this.minimapResizeObserver = new ResizeObserver(() => this.updateMinimapGeometry());
      this.minimapResizeObserver.observe(el);
      this.updateMinimapGeometry();
    });

    // Số lượng/kích thước List đổi (thêm/xoá/thu gọn) hoặc đổi view/layout → đo lại
    // vị trí thật trên DOM sau khi Angular render xong khung mới. Đổi layoutMode cũng
    // phải đo lại vì trục đo (ngang/dọc) đổi hoàn toàn.
    effect(() => {
      this.lists();
      this.collapsedListIds();
      this.viewMode();
      this.layoutMode();
      queueMicrotask(() => this.updateMinimapGeometry());
    });

    inject(DestroyRef).onDestroy(() => this.minimapResizeObserver?.disconnect());
  }

  /** Column View đo theo trục ngang (scrollLeft/clientWidth/rect.left), Row View đo
   *  theo trục dọc (scrollTop/clientHeight/rect.top) — cùng 1 khung #boardScroll,
   *  chỉ 1 trong 2 branch tồn tại trong DOM tại 1 thời điểm (xem board.html). */
  private updateMinimapGeometry(): void {
    const el = this.boardScrollRef()?.nativeElement;
    if (!el) return;
    const horizontal = this.layoutMode() === 'column';
    const containerRect = el.getBoundingClientRect();
    const items: MinimapListGeom[] = [];
    el.querySelectorAll<HTMLElement>('[data-list-id]').forEach((node) => {
      const id = node.dataset['listId'];
      const list = id ? this.lists().find((l) => l.id === id) : undefined;
      if (!id || !list) return;
      const rect = node.getBoundingClientRect();
      const offset = horizontal ? rect.left - containerRect.left + el.scrollLeft : rect.top - containerRect.top + el.scrollTop;
      const size = horizontal ? rect.width : rect.height;
      items.push({ id, name: list.name, cardCount: this.cardsFor(id).length, offset, size });
    });
    this.minimapItems.set(items);
    this.updateMinimapScrollMetrics(el);
  }

  private updateMinimapScrollMetrics(el: HTMLDivElement): void {
    const horizontal = this.layoutMode() === 'column';
    this.minimapScrollPos.set(horizontal ? el.scrollLeft : el.scrollTop);
    this.minimapViewportSize.set(horizontal ? el.clientWidth : el.clientHeight);
    this.minimapContentSize.set(horizontal ? el.scrollWidth : el.scrollHeight);
  }

  /** rAF-throttle: khung cuộn bắn (scroll) rất dày, chỉ đọc lại vị trí — không đo lại
   *  geometry từng List (chỉ đổi khi lists/collapsed/view đổi, xem effect ở trên). */
  onBoardScroll(): void {
    if (this.minimapScrollRaf) return;
    this.minimapScrollRaf = requestAnimationFrame(() => {
      this.minimapScrollRaf = 0;
      const el = this.boardScrollRef()?.nativeElement;
      if (el) this.updateMinimapScrollMetrics(el);
    });
  }

  /** Click 1 List trên Mini Map → cuộn mượt khung Board thật, đưa List đó về gần giữa
   *  (theo trục ngang ở Column View, trục dọc ở Row View). */
  scrollToList(listId: string): void {
    const el = this.boardScrollRef()?.nativeElement;
    const item = this.minimapItems().find((i) => i.id === listId);
    if (!el || !item) return;
    const horizontal = this.layoutMode() === 'column';
    const viewportSize = horizontal ? el.clientWidth : el.clientHeight;
    const contentSize = horizontal ? el.scrollWidth : el.scrollHeight;
    const maxScroll = Math.max(contentSize - viewportSize, 0);
    const target = Math.min(Math.max(item.offset - (viewportSize - item.size) / 2, 0), maxScroll);
    el.scrollTo(horizontal ? { left: target, behavior: 'smooth' } : { top: target, behavior: 'smooth' });
  }

  /** Ai đang mở board này — thanh tiêu đề vẽ dãy avatar. */
  readonly viewers = this.realtime.viewers;
  /** Mất kết nối realtime → hiện dải cảnh báo, vì lúc đó màn hình có thể đã cũ. */
  readonly realtimeConnected = this.realtime.connected;

  constructor() {
    void this.bootstrap();

    // Vào phòng WebSocket của board này, và RỜI khi rời trang. Thiếu vế thứ hai
    // thì mở lần lượt 5 board là đang nghe cùng lúc cả 5.
    const roiPhong = this.realtime.joinBoard(this.boardId);
    inject(DestroyRef).onDestroy(roiPhong);

    // Người khác vừa xoá đúng board mình đang mở → rời đi, đừng để người dùng
    // thao tác tiếp rồi ăn 404 ở mọi nút bấm.
    effect(() => {
      if (this.realtime.boardDeleted() === this.boardId) {
        this.addToast('Board này vừa bị xoá bởi một thành viên khác.', 'error');
        void this.router.navigate(['/workspace']);
      }
    });
    this.loadSavedFilters();
    this.loadSavedHighlightGroups();
    this.loadCollapsedLists();
    this.loadLayoutMode();
    this.setupMinimapTracking();

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
    await this.cardService.loadCards(this.boardId);
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

  // ---- Board 2 chiều (#6): hàng = mức ưu tiên, cột = danh sách ----
  cardsForCell(listId: string, priority: CardPriority): Card[] {
    return this.cardsFor(listId).filter((c) => c.priority === priority);
  }

  matrixCellId(listId: string, priority: CardPriority): string {
    return `${listId}${CELL_SEP}${priority}`;
  }

  private parseCellId(cellId: string): { listId: string; priority: CardPriority } {
    const [listId, priority] = cellId.split(CELL_SEP);
    return { listId, priority: priority as CardPriority };
  }

  /** Kéo-thả tự do theo cả 2 trục cùng lúc: đổi cột = đổi list, đổi hàng = đổi ưu tiên. */
  onMatrixCardDrop(event: CdkDragDrop<Card[]>): void {
    const card = event.item.data as Card;
    const from = this.parseCellId(event.previousContainer.id);
    const to = this.parseCellId(event.container.id);
    const sameCell = from.listId === to.listId && from.priority === to.priority;
    if (sameCell && event.previousIndex === event.currentIndex && this.sortMode() === 'manual') return;
    const targetIndex = this.sortMode() === 'manual' ? event.currentIndex : this.cardsForCell(to.listId, to.priority).length;
    void this.cardService.moveCardOptimistic(card.id, from.listId, to.listId, targetIndex, to.priority);
    if (!sameCell) {
      const priorityLabel = this.priorities.find((p) => p.id === to.priority)?.label ?? to.priority;
      // Backend đã ghi 'card_moved' trong PATCH /cards/:id/move — ghi thêm ở đây
      // là nhật ký hiện hai dòng cho cùng một thao tác kéo thả.
    }
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

  // ---- Tạo danh sách inline (bấm "+ Thêm danh sách" → gõ tên → Enter, kiểu Trello) ----
  async createList(name: string): Promise<void> {
    const list = await this.listService.createList(this.boardId, name);
    if (list) this.addToast(`Đã tạo danh sách "${name}"`, 'success');
  }

  // ---- Tạo thẻ (bấm "+ Thêm thẻ" → tạo ngay với tên mặc định, mở thẳng
  // app-card-detail-modal — dùng chung 1 UI đầy đủ với sửa thẻ — để chỉnh sửa,
  // tiêu đề sẽ tự bôi đen sẵn để gõ đè tên ngay, không cần điền tên trước. ----
  readonly justCreatedCardId = signal<string | null>(null);

  async createCard(listId: string): Promise<void> {
    const card = await this.cardService.createCard(listId, { title: 'Thẻ mới', priority: 'medium' });
    if (!card) return;
    this.justCreatedCardId.set(card.id);
    this.openCardDetail(card);
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
    this.justCreatedCardId.set(null);
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
  }

  handleBulkMove(toListId: string): void {
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

  handleBulkLabel(labelId: string): void {
    const ids = [...this.selectedCardIds()];
    for (const cardId of ids) void this.labelService.attachLabel(cardId, labelId);
    this.addToast(`Đã gắn nhãn cho ${ids.length} thẻ.`, 'success');
    this.clearSelection();
  }

  handleBulkDelete(): void {
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
