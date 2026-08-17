import { Component, computed, inject, input, output, signal } from '@angular/core';
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

/** Người "giả lập đang xem cùng" cho demo Presence (#11) — không có backend Realtime
 *  thật nên dùng nút 🎲 giống demo `09-card-presence.html`, state chỉ tồn tại khi modal mở. */
const PRESENCE_POOL = [
  { name: 'Linh', color: '#7c3aed' },
  { name: 'Khoa', color: '#059669' },
  { name: 'My', color: '#ea580c' },
];

/** Modal chi tiết thẻ (appRequirement #4): sửa tiêu đề/mô tả/phụ trách/hạn/ưu tiên/nhãn
 *  + xoá thẻ. Auto-save từng trường khi rời khỏi ô (blur/change), không có nút "Lưu".
 *  Mục 11: audit trail (ghi log mỗi lần sửa) + presence giả lập (ai đang xem cùng). */
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

  readonly close = output<void>();
  readonly deleted = output<void>();

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

  private log(text: string): void {
    this.activityService.record(this.boardId(), this.card().id, text);
  }

  // ---- Lịch sử thay đổi (#11) ----
  readonly activityLogs = computed(() => this.activityService.logsForCard(this.card().id));
  readonly historyOpen = signal(true);

  toggleHistory(): void {
    this.historyOpen.update((v) => !v);
  }

  // ---- Presence giả lập (#11) ----
  readonly viewers = signal<{ name: string; color: string }[]>([]);
  private viewerPoolIndex = 0;

  addSimulatedViewer(): void {
    if (this.viewers().length >= PRESENCE_POOL.length) return;
    this.viewers.update((v) => [...v, PRESENCE_POOL[this.viewerPoolIndex % PRESENCE_POOL.length]]);
    this.viewerPoolIndex++;
  }

  removeSimulatedViewer(): void {
    this.viewers.update((v) => v.slice(0, -1));
  }

  // ---- Sửa trường — auto-save + ghi log (#11) ----
  onTitleChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    const old = this.card().title;
    if (!value || value === old) return;
    void this.cardService.updateCard(this.card().id, { title: value });
    this.log(`đã đổi tên thẻ từ "${old}" thành "${value}"`);
  }

  onDescriptionChange(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    if (value === (this.card().description ?? '')) return;
    void this.cardService.updateCard(this.card().id, { description: value || undefined });
    this.log('đã cập nhật mô tả');
  }

  onAssigneeChange(assigneeId: string | null): void {
    const oldId = this.card().assigneeId;
    if ((oldId ?? null) === assigneeId) return;
    void this.cardService.updateCard(this.card().id, { assigneeId: assigneeId ?? undefined });
    this.log(`đã đổi người phụ trách từ "${this.memberName(oldId)}" thành "${this.memberName(assigneeId ?? undefined)}"`);
  }

  onDueChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const old = this.card().dueDate;
    if ((old ?? '') === value) return;
    void this.cardService.updateCard(this.card().id, { dueDate: value || undefined });
    this.log(`đã đổi hạn chót từ "${old ?? 'chưa có'}" thành "${value || 'chưa có'}"`);
  }

  onPriorityChange(priority: CardPriority): void {
    const old = this.card().priority;
    if (old === priority) return;
    void this.cardService.updateCard(this.card().id, { priority });
    this.log(`đã đổi mức ưu tiên từ "${PRIORITY_LABEL[old]}" thành "${PRIORITY_LABEL[priority]}"`);
  }

  /** Class Tailwind/DaisyUI cho nút chọn mức ưu tiên (tô màu khi đang được chọn). */
  priorityChoiceClass(id: CardPriority): string {
    const base = 'flex-1 rounded-md border-[1.5px] px-1 py-1.5 text-center text-[11.5px] font-semibold transition-colors';
    if (this.card().priority !== id) return `${base} border-base-300 bg-base-100 text-base-content/80 hover:bg-base-200`;
    const selected: Record<CardPriority, string> = {
      high: 'border-error bg-error/10 text-error',
      medium: 'border-warning bg-warning/10 text-warning',
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
