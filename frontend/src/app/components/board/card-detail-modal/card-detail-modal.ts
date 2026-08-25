import { Component, ElementRef, HostListener, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Card, CardPriority, User } from '../../../models';
import { CardStore } from '../../../ngrx/card/card.store';
import type { CardChanges } from '../../../ngrx/card/card.methods';
import { LabelStore } from '../../../ngrx/label/label.store';
import { BoardStore } from '../../../ngrx/board/board.store';
import { ActivityStore } from '../../../ngrx/activity/activity.store';
import { ChecklistStore } from '../../../ngrx/checklist/checklist.store';
import { CommentStore } from '../../../ngrx/comment/comment.store';
import { AttachmentStore } from '../../../ngrx/attachment/attachment.store';
import { LabelPicker } from '../label-picker/label-picker';
import { Checklist } from '../checklist/checklist';
import { CommentList } from '../comment-list/comment-list';

const PRIORITIES: { id: CardPriority; label: string }[] = [
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
];
const PRIORITY_LABEL: Record<CardPriority, string> = { high: 'High', medium: 'Medium', low: 'Low' };

/**
 * Modal chi tiết thẻ: sửa tiêu đề / mô tả / phụ trách / hạn / ưu tiên / nhãn + xoá thẻ.
 *
 * ── LƯU CÓ XÁC NHẬN, không auto-save nữa.
 *
 * Bản trước lưu từng trường theo sự kiện `change` (tức là lúc rời khỏi ô). Nghe
 * thì tiện, nhưng hỏng đúng ở thao tác tự nhiên nhất: gõ xong rồi bấm ra ngoài
 * để đóng modal. Cú bấm đó vừa làm ô mất focus vừa đóng modal — modal bị gỡ
 * khỏi DOM trước khi `change` kịp bắn, nên thay đổi mất trắng mà không báo gì.
 *
 * Nay mọi thay đổi vào BẢN NHÁP trong bộ nhớ; bấm "Lưu thay đổi" mới gửi lên
 * server. Bấm ra ngoài khi còn thay đổi chưa lưu thì hiện dải hỏi lại thay vì
 * đóng ngay.
 *
 * Nhãn, checklist, bình luận, đính kèm KHÔNG nằm trong bản nháp — chúng là thực
 * thể riêng, mỗi thao tác là một hành động dứt khoát của người dùng (tick một
 * mục, gửi một bình luận) nên lưu ngay là đúng.
 */
@Component({
  selector: 'app-card-detail-modal',
  imports: [FormsModule, DatePipe, LabelPicker, Checklist, CommentList],
  templateUrl: './card-detail-modal.html',
  styleUrl: './card-detail-modal.css',
})
export class CardDetailModal {
  private readonly cardService = inject(CardStore);
  private readonly labelService = inject(LabelStore);
  private readonly boardService = inject(BoardStore);
  private readonly activityService = inject(ActivityStore);
  private readonly checklistService = inject(ChecklistStore);
  private readonly commentService = inject(CommentStore);
  private readonly attachmentService = inject(AttachmentStore);

  readonly card = input.required<Card>();
  readonly boardId = input.required<string>();
  /** Thẻ vừa tạo (chưa đặt tên) — tự bôi đen ô tiêu đề để gõ đè ngay, không cần
   *  đóng modal rồi mở lại mới sửa được tên. */
  readonly autoFocusTitle = input(false);

  readonly close = output<void>();
  readonly deleted = output<void>();

  private readonly titleInputRef = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  constructor() {
    // Mở thẻ nào thì nạp bản nháp của thẻ đó. `card()` là computed đọc lại từ
    // CardStore nên nó cũng đổi khi người khác sửa thẻ qua WebSocket — chỉ nạp
    // lại khi ĐỔI SANG THẺ KHÁC, nếu không thì đang gõ dở bị ghi đè mất.
    let thẻĐangMở: string | null = null;
    effect(() => {
      const c = this.card();
      if (c.id === thẻĐangMở) return;
      thẻĐangMở = c.id;
      untracked(() => this.nạpBảnNháp(c));
    });

    // Đính kèm nạp từ server. Bắt buộc `force` khi mở lại thẻ: link tải là link
    // CÓ CHỮ KÝ hết hạn sau 1 giờ, dùng lại link cũ là ảnh hỏng.
    effect(() => {
      const id = this.card().id;
      if (id) void this.attachmentService.loadAttachments(id);
    });

    setTimeout(() => {
      if (!this.autoFocusTitle()) return;
      const el = this.titleInputRef()?.nativeElement;
      el?.focus();
      el?.select();
    });
  }

  readonly priorities = PRIORITIES;
  readonly members = this.boardService.members;

  readonly selectedLabelIds = computed(() => this.labelService.cardLabelIds()[this.card().id] ?? []);

  readonly membersById = computed(() => {
    const map: Record<string, User | undefined> = {};
    for (const m of this.members()) map[m.id] = m;
    return map;
  });

  private memberName(id: string | undefined): string {
    if (!id) return 'unassigned';
    const m = this.membersById()[id];
    return m?.displayName ?? m?.email ?? id;
  }

  /** Thẻ vừa tạo (đang ở lần mở đầu tiên, tự động bung ra) — sửa gì trong lần mở
   *  này KHÔNG ghi lịch sử; chỉ khi đóng modal rồi mở lại (autoFocusTitle() = false)
   *  mới bắt đầu ghi nhận thay đổi. */
  private log(text: string): void {
    if (this.autoFocusTitle()) return;
    this.activityService.record(this.boardId(), this.card().id, text);
  }

  // ---- Lịch sử thay đổi (#11) ----
  readonly activityLogs = computed(() => this.activityService.logsForCard(this.card().id));
  readonly historyOpen = signal(true);

  toggleHistory(): void {
    this.historyOpen.update((v) => !v);
  }

  // ---- Bản nháp: sửa vào đây trước, bấm "Lưu thay đổi" mới gửi lên server ----
  readonly draftTitle = signal('');
  readonly draftDescription = signal('');
  readonly draftAssigneeId = signal<string | null>(null);
  readonly draftDueDate = signal('');
  readonly draftPriority = signal<CardPriority>('medium');

  readonly saving = signal(false);
  /** Vừa lưu xong — hiện "Đã lưu" vài giây để người dùng biết chắc là đã ăn. */
  readonly justSaved = signal(false);
  /** Bấm ra ngoài khi còn thay đổi chưa lưu → hiện dải hỏi lại thay vì đóng luôn. */
  readonly confirmClose = signal(false);

  private nạpBảnNháp(card: Card): void {
    this.draftTitle.set(card.title);
    this.draftDescription.set(card.description ?? '');
    this.draftAssigneeId.set(card.assigneeId ?? null);
    this.draftDueDate.set(card.dueDate ?? '');
    this.draftPriority.set(card.priority);
    this.confirmClose.set(false);
  }

  /** Còn thay đổi chưa lưu không? Quyết định việc hiện nút Lưu và dải hỏi lại. */
  readonly dirty = computed(() => {
    const c = this.card();
    return (
      this.draftTitle().trim() !== c.title ||
      this.draftDescription() !== (c.description ?? '') ||
      this.draftAssigneeId() !== (c.assigneeId ?? null) ||
      this.draftDueDate() !== (c.dueDate ?? '') ||
      this.draftPriority() !== c.priority
    );
  });

  /** Tiêu đề trống thì không cho lưu — thẻ không tên là không tìm lại được. */
  readonly canSave = computed(() => this.dirty() && !!this.draftTitle().trim() && !this.saving());

  async save(): Promise<void> {
    if (!this.canSave()) return;
    const c = this.card();
    // `null` = XOÁ trường đó trên server. Trước đây chỗ này dùng `undefined`,
    // mà `undefined` bị JSON.stringify bỏ khỏi body, nên backend — vốn chỉ ghi
    // khi field `!== undefined` — hiểu thành "giữ nguyên". Hậu quả: bỏ người
    // phụ trách, xoá mô tả, xoá hạn đều im lặng KHÔNG ăn. Giao diện vẫn hiện
    // đã xoá (vì bản cập nhật lạc quan ở local có đổi), tới lần F5 giá trị cũ
    // quay lại. Nếu chỉ đổi đúng một trong ba trường đó thì còn tệ hơn: store
    // thấy patch rỗng nên không gọi API lần nào.
    const changes: CardChanges = {};
    const nhatKy: string[] = [];

    const title = this.draftTitle().trim();
    if (title !== c.title) {
      changes.title = title;
      nhatKy.push(`renamed card from "${c.title}" to "${title}"`);
    }
    if (this.draftDescription() !== (c.description ?? '')) {
      changes.description = this.draftDescription() || null;
      nhatKy.push('updated the description');
    }
    if (this.draftAssigneeId() !== (c.assigneeId ?? null)) {
      changes.assigneeId = this.draftAssigneeId() ?? null;
      nhatKy.push(
        `changed assignee from "${this.memberName(c.assigneeId)}" to "${this.memberName(this.draftAssigneeId() ?? undefined)}"`,
      );
    }
    if (this.draftDueDate() !== (c.dueDate ?? '')) {
      changes.dueDate = this.draftDueDate() || null;
      nhatKy.push(`changed due date from "${c.dueDate ?? 'none'}" to "${this.draftDueDate() || 'none'}"`);
    }
    if (this.draftPriority() !== c.priority) {
      changes.priority = this.draftPriority();
      nhatKy.push(
        `changed priority from "${PRIORITY_LABEL[c.priority]}" to "${PRIORITY_LABEL[this.draftPriority()]}"`,
      );
    }

    this.saving.set(true);
    // MỘT request cho tất cả trường đã đổi, thay vì mỗi ô một request như trước.
    await this.cardService.updateCard(c.id, changes);
    this.saving.set(false);

    for (const d of nhatKy) this.log(d);
    this.flashSaved();
  }

  /** Bỏ mọi thay đổi, quay lại đúng dữ liệu đang có trên server. */
  discard(): void {
    this.nạpBảnNháp(this.card());
    this.editingDesc.set(false);
  }

  /** Phím Esc — cùng một đường đóng có xác nhận với nền ngoài/nút X, không tự
   *  ý bỏ qua bản nháp chưa lưu. Gắn ở `document` vì phím tắt phải ăn dù đang
   *  focus ở đâu trong modal (input tiêu đề, ô mô tả...), không chỉ khi
   *  phần tử gốc của component đang được focus. */
  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.attemptClose();
  }

  /**
   * Thẻ vừa tạo (autoFocusTitle) mà đóng modal ngay, KHÔNG đụng gì tới bất kỳ
   * trường nào (kể cả nhãn/checklist/đính kèm/bình luận — những thứ lưu ngay,
   * không nằm trong bản nháp) → coi là bấm "Add card" nhầm/bỏ dở, xoá thẻ rác
   * thay vì để lại một thẻ "New card" vô chủ trên board mãi mãi.
   *
   * Cố ý kiểm tra CẢ checklist/đính kèm/bình luận, không chỉ bản nháp: nếu
   * người dùng đã kịp đính 1 tệp thật rồi mới đóng, đó là dữ liệu thật của họ
   * — xoá nhầm còn tệ hơn để lại một thẻ "New card" thừa.
   */
  private readonly isAbandonedFreshCard = computed(
    () =>
      this.autoFocusTitle() &&
      !this.dirty() &&
      this.attachments().length === 0 &&
      this.selectedLabelIds().length === 0 &&
      this.checklistService.itemsFor(this.card().id).length === 0 &&
      this.commentService.commentsFor(this.card().id).length === 0,
  );

  /**
   * Bấm nền ngoài / nút X / Esc.
   *
   * Còn thay đổi chưa lưu thì KHÔNG đóng ngay — hiện dải hỏi lại. Đây chính là
   * chỗ người dùng mất dữ liệu ở bản trước.
   */
  attemptClose(): void {
    if (this.isAbandonedFreshCard()) {
      void this.cardService.deleteCard(this.card().id, this.card().listId);
      this.close.emit();
      return;
    }
    if (this.dirty()) {
      this.confirmClose.set(true);
      return;
    }
    this.close.emit();
  }

  async saveAndClose(): Promise<void> {
    await this.save();
    this.close.emit();
  }

  discardAndClose(): void {
    this.discard();
    this.close.emit();
  }

  /** Class Tailwind/DaisyUI cho nút chọn mức ưu tiên (tô màu khi đang được chọn). */
  priorityChoiceClass(id: CardPriority): string {
    // h-8 (32px) — khớp chiều cao select-sm/input-sm ở 2 ô cùng hàng (Assignee,
    // Due date); trước đây pill này chỉ cao theo padding chữ (py-1.5 ≈ 26px),
    // thấp hơn rõ rệt so với 2 ô bên cạnh trong cùng lưới 3 cột.
    const base = 'btn btn-sm h-8 min-h-0 flex-1 px-1 text-center text-[11.5px] font-semibold';
    if (this.draftPriority() !== id) return `${base} btn-outline`;
    const selected: Record<CardPriority, string> = {
      high: 'btn-error btn-soft',
      medium: 'btn-warning btn-soft',
      low: 'btn-neutral btn-soft',
    };
    return `${base} ${selected[id]}`;
  }

  onLabelsChange(labelIds: string[]): void {
    this.labelService.setCardLabels(this.card().id, labelIds);
    this.log('updated labels');
    this.flashSaved();
  }

  // ---- Đính kèm tệp/hình ----
  readonly attachments = computed(() => this.attachmentService.attachmentsFor(this.card().id));
  readonly cover = computed(() => this.attachmentService.coverFor(this.card().id));
  /** Toggle mở khối mô tả sang chế độ chỉnh sửa — Trello ẩn textarea tới khi bấm "Chỉnh sửa". */
  readonly editingDesc = signal(false);

  toggleEditDesc(): void {
    this.editingDesc.update((v) => !v);
  }

  /** Nhãn/checklist/đính kèm/bình luận lưu NGAY khi bấm, không qua nút "Save
   *  changes" (xem chú thích đầu file) — nút đó vì vậy đứng im/disabled sau
   *  các thao tác này, dễ khiến người dùng tưởng "chưa lưu được gì". Bật lại
   *  ĐÚNG cái badge "Saved" cạnh tiêu đề (vốn chỉ chạy cho save() ở trên) cho
   *  các thao tác này luôn, để luôn có tín hiệu xác nhận dù không đụng nút Save. */
  private flashSaved(): void {
    this.justSaved.set(true);
    setTimeout(() => this.justSaved.set(false), 2000);
  }

  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    if (!files.length) return;
    const added = await this.attachmentService.addFiles(this.card().id, files);
    input.value = ''; // cho phép chọn lại cùng tệp
    for (const a of added) this.log(`attached "${a.name}"`);
    if (added.length) this.flashSaved();
  }

  removeAttachment(id: string, name: string): void {
    void this.attachmentService.remove(this.card().id, id);
    this.log(`removed attachment "${name}"`);
    this.flashSaved();
  }

  toggleCover(id: string): void {
    void this.attachmentService.toggleCover(this.card().id, id);
    this.flashSaved();
  }

  /** Mở tệp bằng link ký. `null` nghĩa là link chưa cấp được — báo thay vì mở tab trắng. */
  openAttachment(url: string | null): void {
    if (!url) {
      this.attachmentUploading();
      return;
    }
    window.open(url, '_blank', 'noopener');
  }

  /** Đang tải tệp lên — nút Đính kèm hiện vòng xoay. */
  readonly attachmentUploading = this.attachmentService.uploading;

  /** Nhãn ngắn theo loại tệp cho ô placeholder (PDF/RTF/DOC...). */
  fileBadge(att: { name: string; mimeType: string }): string {
    const ext = att.name.split('.').pop()?.toUpperCase();
    if (ext && ext.length <= 4) return ext;
    return att.mimeType.split('/').pop()?.slice(0, 4).toUpperCase() ?? 'FILE';
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  requestDelete(): void {
    if (!window.confirm(`Delete card "${this.card().title}"? This cannot be undone.`)) return;
    void this.cardService.deleteCard(this.card().id, this.card().listId);
    this.checklistService.clearCard(this.card().id);
    this.commentService.clearCard(this.card().id);
    this.attachmentService.clearCard(this.card().id);
    this.deleted.emit();
  }
}
