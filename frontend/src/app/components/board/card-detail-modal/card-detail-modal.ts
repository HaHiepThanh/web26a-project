import { Component, DestroyRef, ElementRef, HostListener, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Card, CardPriority, User, ActivityLog } from '../../../models';
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
import { UserAvatar } from '../../shared/user-avatar/user-avatar';
import { avatarColorFor, initialsOf } from '../../../utils/avatar.util';

const PRIORITIES: { id: CardPriority; label: string }[] = [
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
];
const PRIORITY_LABEL: Record<CardPriority, string> = { high: 'High', medium: 'Medium', low: 'Low' };

/** Backend chặn ở 10MB — kiểm ngay lúc CHỌN tệp để báo liền, thay vì để người
 *  dùng bấm Lưu rồi mới biết tệp bị từ chối. */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Một dòng trong danh sách đính kèm */
export interface AttachmentRow {
  key: string;
  id: string;
  name: string;
  size: number;
  mimeType: string;
  isImage: boolean;
  url: string | null;
  isCover: boolean;
  isPending: boolean;
}

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
  imports: [FormsModule, DatePipe, LabelPicker, Checklist, CommentList, UserAvatar],
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
  /**
   * Đã lưu xong một lần. Thẻ từ đây là dữ liệu thật, không còn là "thẻ vừa tạo
   * chưa đụng tới" nữa — trang Board dựa vào đây để thôi coi nó là bản nháp.
   */
  readonly saved = output<void>();

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
      untracked(() => {
        this.nạpBảnNháp(c);
      });
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

  logUserName(log: ActivityLog): string {
    if (log.user?.displayName) return log.user.displayName;
    const m = this.membersById()[log.userId];
    return m?.displayName ?? m?.email ?? 'Someone';
  }

  logUserAvatar(log: ActivityLog): string | undefined {
    return log.user?.avatarUrl ?? this.membersById()[log.userId]?.avatarUrl ?? undefined;
  }

  logUserInitials(log: ActivityLog): string {
    return initialsOf(this.logUserName(log));
  }

  logUserColor(log: ActivityLog): string {
    return avatarColorFor(log.userId);
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
  /** Đã bấm "Lưu thay đổi" thành công ít nhất 1 lần từ lúc thẻ này được mở.
   *  `dirty()` tự trở về false ngay sau khi lưu (bản nháp lại khớp thẻ đã lưu),
   *  nên KHÔNG thể dùng `!dirty()` một mình để suy ra "thẻ chưa từng được sửa" —
   *  làm vậy thì gõ tên xong bấm Lưu rồi bấm đóng sẽ bị hiểu nhầm thành "bấm nhầm
   *  chưa đụng gì" và xoá mất thẻ vừa lưu. Cờ này chặn đúng trường hợp đó. */
  private readonly savedOnce = signal(false);
  /** Bấm ra ngoài khi còn thay đổi chưa lưu → hiện dải hỏi lại thay vì đóng luôn. */
  readonly confirmClose = signal(false);
  /** Bấm "Delete card" → hiện dải hỏi lại NGAY TRONG modal thay vì `window.confirm`.
   *  Trình duyệt (Chrome) tự tắt hộp `confirm()`/`alert()` sau khi trang gọi liên
   *  tiếp nhiều lần trong thời gian ngắn — lúc đó `confirm()` trả `false` NGAY LẬP
   *  TỨC, không hiện gì cả, người dùng bấm nút mà tưởng nó không phản hồi. Dải hỏi
   *  lại tự vẽ bằng HTML không bao giờ bị chặn kiểu đó. */
  readonly confirmDelete = signal(false);

  private nạpBảnNháp(card: Card): void {
    this.draftTitle.set(card.title);
    this.draftDescription.set(card.description ?? '');
    this.draftAssigneeId.set(card.assigneeId ?? null);
    this.draftDueDate.set(card.dueDate ?? '');
    this.draftPriority.set(card.priority);
    this.confirmClose.set(false);
    this.confirmDelete.set(false);
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

  readonly isCompleted = computed(() => !!this.card().completedAt);

  async toggleCompleted(): Promise<void> {
    const c = this.card();
    const completedAt = c.completedAt ? null : new Date().toISOString();
    await this.cardService.updateCard(c.id, { completedAt });
  }

  /** Tiêu đề trống thì không cho lưu — thẻ không tên là không tìm lại được. */
  readonly canSave = computed(() => this.dirty() && !!this.draftTitle().trim() && !this.saving());

  async save(): Promise<void> {
    if (!this.canSave()) return;
    this.savedOnce.set(true);
    const c = this.card();
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
    try {
      if (Object.keys(changes).length > 0) await this.cardService.updateCard(c.id, changes);
    } finally {
      this.saving.set(false);
    }

    for (const d of nhatKy) this.log(d);
    this.flashSaved();
    this.saved.emit();
  }

  /** Bỏ mọi thay đổi, quay lại đúng dữ liệu đang có trên server. */
  discard(): void {
    this.nạpBảnNháp(this.card());
    this.editingDesc.set(false);
  }

  /** Phím Esc — cùng một đường đóng có xác nhận với nền ngoài/nút X, không tự
   *  ý bỏ qua bản nháp chưa lưu. */
  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.attemptClose();
  }

  /**
   * Thẻ vừa tạo (autoFocusTitle) mà đóng modal ngay, KHÔNG đụng gì tới bất kỳ
   * trường nào (kể cả nhãn/checklist/đính kèm/bình luận) → xoá thẻ tạo nhầm.
   */
  private readonly isAbandonedFreshCard = computed(
    () =>
      this.autoFocusTitle() &&
      !this.savedOnce() &&
      !this.dirty() &&
      this.attachments().length === 0 &&
      this.selectedLabelIds().length === 0 &&
      this.checklistService.itemsFor(this.card().id).length === 0 &&
      this.commentService.commentsFor(this.card().id).length === 0,
  );

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
    const base = 'btn btn-sm h-8 min-h-0 flex-1 px-1 text-center text-[11.5px] font-bold rounded-md';
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
  // Đính kèm được lưu NGAY LẬP TỨC khi tải lên (giống nhãn/checklist/bình luận),
  // không giữ trong bản nháp để tránh mất dữ liệu khi đóng hoặc F5 trang.
  readonly attachments = computed(() => this.attachmentService.attachmentsFor(this.card().id));
  readonly cover = computed(() => this.attachmentService.coverFor(this.card().id));

  readonly attachmentRows = computed<AttachmentRow[]>(() => {
    const cover = this.cover();
    return this.attachments().map((a) => ({
      key: `saved:${a.id}`,
      id: a.id,
      name: a.name,
      size: a.size,
      mimeType: a.mimeType,
      isImage: a.isImage,
      url: a.url,
      isCover: a.id === cover?.id,
      isPending: false,
    }));
  });

  readonly coverRow = computed(() => this.attachmentRows().find((r) => r.isCover) ?? null);

  /** Toggle mở khối mô tả sang chế độ chỉnh sửa. */
  readonly editingDesc = signal(false);

  toggleEditDesc(): void {
    this.editingDesc.update((v) => !v);
  }

  private flashSaved(): void {
    this.justSaved.set(true);
    setTimeout(() => this.justSaved.set(false), 2000);
  }

  /** Thông báo lỗi upload (tệp quá nặng, kiểm duyệt, mạng...). */
  readonly attachmentError = signal<string | null>(null);
  readonly isDraggingOver = signal(false);

  async uploadFiles(files: File[]): Promise<void> {
    if (!files.length) return;
    this.attachmentError.set(null);

    const quaNang = files.filter((f) => f.size > MAX_ATTACHMENT_BYTES);
    if (quaNang.length) {
      this.attachmentError.set(
        `${quaNang.map((f) => `"${f.name}"`).join(', ')} exceeds ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB limit and was skipped.`,
      );
    }

    const hopLe = files.filter((f) => f.size <= MAX_ATTACHMENT_BYTES);
    if (!hopLe.length) return;

    const cardId = this.card().id;
    const added = await this.attachmentService.addFiles(cardId, hopLe);
    if (added.length) {
      for (const a of added) this.log(`attached "${a.name}"`);
      this.flashSaved();
      this.saved.emit();
    }
    const lastErr = this.attachmentService.lastError();
    if (lastErr) {
      this.attachmentError.set(lastErr.message);
    }
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    input.value = ''; // cho phép chọn lại cùng tệp
    void this.uploadFiles(files);
  }

  /** Dán ảnh trực tiếp từ clipboard (Ctrl+V / Cmd+V) vào thẻ */
  @HostListener('paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          const ext = file.type.split('/')[1] || 'png';
          const renamed = new File([file], file.name || `pasted-image-${Date.now()}.${ext}`, { type: file.type });
          files.push(renamed);
        }
      }
    }
    if (files.length) {
      event.preventDefault();
      void this.uploadFiles(files);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingOver.set(false);
    const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
    if (files.length) {
      void this.uploadFiles(files);
    }
  }

  async removeAttachment(row: AttachmentRow): Promise<void> {
    if (!row.id) return;
    const cardId = this.card().id;
    await this.attachmentService.remove(cardId, row.id);
    this.log(`removed attachment "${row.name}"`);
    this.flashSaved();
    this.saved.emit();
  }

  async toggleCover(row: AttachmentRow): Promise<void> {
    if (!row.id) return;
    const cardId = this.card().id;
    await this.attachmentService.toggleCover(cardId, row.id);
    this.flashSaved();
    this.saved.emit();
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
    this.confirmDelete.set(true);
  }

  confirmDeleteCard(): void {
    this.confirmDelete.set(false);
    void this.cardService.deleteCard(this.card().id, this.card().listId);
    this.checklistService.clearCard(this.card().id);
    this.commentService.clearCard(this.card().id);
    this.attachmentService.clearCard(this.card().id);
    this.deleted.emit();
  }
}
