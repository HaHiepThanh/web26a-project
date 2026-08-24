import { Component, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Card, CardPriority, User } from '../../../models';
import { CardService } from '../../../services/card.service';
import { LabelService } from '../../../services/label.service';
import { BoardService } from '../../../services/board.service';
import { ActivityService } from '../../../services/activity.service';
import { ChecklistService } from '../../../services/checklist.service';
import { CommentService } from '../../../services/comment.service';
import { AttachmentService } from '../../../services/attachment.service';
import { LabelPicker } from '../label-picker/label-picker';
import { Checklist } from '../checklist/checklist';
import { CommentList } from '../comment-list/comment-list';

const PRIORITIES: { id: CardPriority; label: string }[] = [
  { id: 'high', label: 'Cao' },
  { id: 'medium', label: 'Trung bình' },
  { id: 'low', label: 'Thấp' },
];
const PRIORITY_LABEL: Record<CardPriority, string> = { high: 'Cao', medium: 'Trung bình', low: 'Thấp' };

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
  private readonly cardService = inject(CardService);
  private readonly labelService = inject(LabelService);
  private readonly boardService = inject(BoardService);
  private readonly activityService = inject(ActivityService);
  private readonly checklistService = inject(ChecklistService);
  private readonly commentService = inject(CommentService);
  private readonly attachmentService = inject(AttachmentService);

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
    // CardService nên nó cũng đổi khi người khác sửa thẻ qua WebSocket — chỉ nạp
    // lại khi ĐỔI SANG THẺ KHÁC, nếu không thì đang gõ dở bị ghi đè mất.
    let thẻĐangMở: string | null = null;
    effect(() => {
      const c = this.card();
      if (c.id === thẻĐangMở) return;
      thẻĐangMở = c.id;
      untracked(() => this.nạpBảnNháp(c));
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
    if (!id) return 'chưa gán';
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
    const changes: Partial<Card> = {};
    const nhatKy: string[] = [];

    const title = this.draftTitle().trim();
    if (title !== c.title) {
      changes.title = title;
      nhatKy.push(`đã đổi tên thẻ từ "${c.title}" thành "${title}"`);
    }
    if (this.draftDescription() !== (c.description ?? '')) {
      changes.description = this.draftDescription() || undefined;
      nhatKy.push('đã cập nhật mô tả');
    }
    if (this.draftAssigneeId() !== (c.assigneeId ?? null)) {
      changes.assigneeId = this.draftAssigneeId() ?? undefined;
      nhatKy.push(
        `đã đổi người phụ trách từ "${this.memberName(c.assigneeId)}" thành "${this.memberName(this.draftAssigneeId() ?? undefined)}"`,
      );
    }
    if (this.draftDueDate() !== (c.dueDate ?? '')) {
      changes.dueDate = this.draftDueDate() || undefined;
      nhatKy.push(`đã đổi hạn chót từ "${c.dueDate ?? 'chưa có'}" thành "${this.draftDueDate() || 'chưa có'}"`);
    }
    if (this.draftPriority() !== c.priority) {
      changes.priority = this.draftPriority();
      nhatKy.push(
        `đã đổi mức ưu tiên từ "${PRIORITY_LABEL[c.priority]}" thành "${PRIORITY_LABEL[this.draftPriority()]}"`,
      );
    }

    this.saving.set(true);
    // MỘT request cho tất cả trường đã đổi, thay vì mỗi ô một request như trước.
    await this.cardService.updateCard(c.id, changes);
    this.saving.set(false);

    for (const d of nhatKy) this.log(d);
    this.justSaved.set(true);
    setTimeout(() => this.justSaved.set(false), 2000);
  }

  /** Bỏ mọi thay đổi, quay lại đúng dữ liệu đang có trên server. */
  discard(): void {
    this.nạpBảnNháp(this.card());
    this.editingDesc.set(false);
  }

  /**
   * Bấm nền ngoài / nút X / Esc.
   *
   * Còn thay đổi chưa lưu thì KHÔNG đóng ngay — hiện dải hỏi lại. Đây chính là
   * chỗ người dùng mất dữ liệu ở bản trước.
   */
  attemptClose(): void {
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
    // text-xs (12px) chứ không phải text-[11.5px]: nửa pixel lẻ nằm ngoài mọi
    // thang chữ và không ai phân biệt được với 12px. ctl-md đưa chip về đúng
    // bậc chiều cao của hệ (40px, 44px trên cảm ứng).
    const base =
      'ctl-md flex-1 whitespace-nowrap rounded-lg border-[1.5px] px-2 text-center text-xs font-semibold transition-colors';
    if (this.draftPriority() !== id) return `${base} border-base-300 bg-base-100 text-base-content/80 hover:bg-base-200`;
    const selected: Record<CardPriority, string> = {
      high: 'border-error bg-error/10 prio-high',
      medium: 'border-warning bg-warning/10 prio-med',
      low: 'border-base-content/40 bg-base-200 text-base-content/80',
    };
    return `${base} ${selected[id]}`;
  }

  onLabelsChange(labelIds: string[]): void {
    this.labelService.setCardLabels(this.card().id, labelIds);
    this.log('đã cập nhật nhãn');
  }

  // ---- Đính kèm tệp/hình ----
  readonly attachments = computed(() => this.attachmentService.attachmentsFor(this.card().id));
  readonly cover = computed(() => this.attachmentService.coverFor(this.card().id));
  /** Toggle mở khối mô tả sang chế độ chỉnh sửa — Trello ẩn textarea tới khi bấm "Chỉnh sửa". */
  readonly editingDesc = signal(false);

  toggleEditDesc(): void {
    this.editingDesc.update((v) => !v);
  }

  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    if (!files.length) return;
    const added = await this.attachmentService.addFiles(this.card().id, files);
    input.value = ''; // cho phép chọn lại cùng tệp
    for (const a of added) this.log(`đã đính kèm "${a.name}"`);
  }

  removeAttachment(id: string, name: string): void {
    this.attachmentService.remove(this.card().id, id);
    this.log(`đã gỡ đính kèm "${name}"`);
  }

  toggleCover(id: string): void {
    this.attachmentService.toggleCover(this.card().id, id);
  }

  openAttachment(dataUrl: string): void {
    window.open(dataUrl, '_blank');
  }

  /** Nhãn ngắn theo loại tệp cho ô placeholder (PDF/RTF/DOC...). */
  fileBadge(att: { name: string; mimeType: string }): string {
    const ext = att.name.split('.').pop()?.toUpperCase();
    if (ext && ext.length <= 4) return ext;
    return att.mimeType.split('/').pop()?.slice(0, 4).toUpperCase() ?? 'TỆP';
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  requestDelete(): void {
    if (!window.confirm(`Xoá thẻ "${this.card().title}"? Không thể hoàn tác.`)) return;
    void this.cardService.deleteCard(this.card().id, this.card().listId);
    this.checklistService.clearCard(this.card().id);
    this.commentService.clearCard(this.card().id);
    this.attachmentService.clearCard(this.card().id);
    this.deleted.emit();
  }
}
