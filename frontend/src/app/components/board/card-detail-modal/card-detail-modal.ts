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

/** Tệp đã chọn nhưng chưa tải lên. `previewUrl` là object URL của chính tệp đó —
 *  phải `revokeObjectURL` khi bỏ đi, nếu không là rò bộ nhớ. */
interface PendingAttachment {
  localId: string;
  file: File;
  name: string;
  size: number;
  isImage: boolean;
  previewUrl: string;
}

/** Một dòng trong danh sách đính kèm — gộp chung tệp đã lưu và tệp đang chờ lưu
 *  để template chỉ phải vẽ MỘT kiểu, không rẽ nhánh hai danh sách. */
export interface AttachmentRow {
  key: string;
  /** id thật trên server; `null` nghĩa là tệp còn đang chờ tải lên. */
  id: string | null;
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
        // Tệp đang chờ lưu thuộc về THẺ CŨ — mang sang thẻ mới là đính nhầm chỗ.
        this.xoaDinhKemChoLuu();
        this.nạpBảnNháp(c);
      });
    });

    // Object URL sống tới khi tab đóng nếu không thu hồi; đóng modal lúc còn tệp
    // chờ lưu (bấm X, hoặc rời board) là rò đúng bằng dung lượng các tệp đó.
    inject(DestroyRef).onDestroy(() => {
      for (const p of this.pendingFiles()) URL.revokeObjectURL(p.previewUrl);
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
  /** Tệp vừa chọn nhưng CHƯA tải lên — xem khối "Đính kèm" bên dưới. */
  readonly pendingFiles = signal<PendingAttachment[]>([]);
  /** id các đính kèm ĐÃ LƯU bị bấm xoá nhưng chưa gửi lệnh xoá lên server. */
  readonly pendingRemovals = signal<ReadonlySet<string>>(new Set());
  /**
   * Ảnh bìa người dùng tự chọn trong bản nháp, và cờ "đã đụng vào".
   *
   * Cần cờ riêng chứ không thể chỉ giữ một giá trị: đính kèm nạp về BẤT ĐỒNG BỘ
   * sau khi modal đã mở, nên bìa đang lưu lúc đầu luôn là `null` rồi mới nhảy
   * sang giá trị thật. Nếu đặt sẵn bản nháp bằng giá trị lúc đầu thì mở một thẻ
   * đã có bìa là bản nháp lệch ngay, nút "Lưu thay đổi" sáng lên dù người dùng
   * chưa làm gì. Chưa đụng vào thì bìa nháp = bìa đang lưu, đọc thẳng.
   */
  private readonly coverTouched = signal(false);
  private readonly coverChoice = signal<string | null>(null);
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
    this.coverTouched.set(false);
    this.coverChoice.set(null);
  }

  /** Còn thay đổi chưa lưu không? Quyết định việc hiện nút Lưu và dải hỏi lại. */
  readonly dirty = computed(() => {
    const c = this.card();
    return (
      this.draftTitle().trim() !== c.title ||
      this.draftDescription() !== (c.description ?? '') ||
      this.draftAssigneeId() !== (c.assigneeId ?? null) ||
      this.draftDueDate() !== (c.dueDate ?? '') ||
      this.draftPriority() !== c.priority ||
      this.attachmentsDirty()
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
    // Đã lưu một lần thì thẻ này KHÔNG còn là "thẻ tạo nhầm" nữa — xem
    // `isAbandonedFreshCard`. Phải ghi trước khi lưu xong, vì lưu xong là
    // `dirty()` trở lại false và điều kiện xoá lại đúng.
    this.savedOnce.set(true);
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
    try {
      // MỘT request cho tất cả trường đã đổi, thay vì mỗi ô một request như trước.
      // Chỉ gọi khi thực sự có trường đổi: người dùng có thể chỉ đính kèm ảnh mà
      // không đụng ô nào, lúc đó patch rỗng và backend trả 400 "Nothing to update".
      if (Object.keys(changes).length > 0) await this.cardService.updateCard(c.id, changes);
      await this.luuDinhKem();
    } finally {
      this.saving.set(false);
    }

    for (const d of nhatKy) this.log(d);
    this.flashSaved();
    this.saved.emit();
  }

  /** Bỏ mọi thay đổi, quay lại đúng dữ liệu đang có trên server. */
  discard(): void {
    this.xoaDinhKemChoLuu();
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
      !this.savedOnce() &&
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
  //
  // Đính kèm nằm TRONG BẢN NHÁP giống 5 trường ở trên: chọn tệp / bỏ tệp / đổi
  // ảnh bìa đều chỉ đổi trên màn hình, bấm "Lưu thay đổi" mới thật sự tải lên và
  // xoá trên server. Trước đây mỗi thao tác gọi API ngay, nên chọn nhầm một tệp
  // 8MB là nó đã nằm trên Storage rồi, bấm "Bỏ thay đổi" cũng không gỡ ra được.
  readonly attachments = computed(() => this.attachmentService.attachmentsFor(this.card().id));
  readonly cover = computed(() => this.attachmentService.coverFor(this.card().id));

  /** Ảnh bìa đang lưu trên server, dưới dạng `key` để so với bìa nháp. */
  private readonly savedCoverKey = computed(() => {
    const c = this.cover();
    return c ? `saved:${c.id}` : null;
  });

  /** Bìa đang hiển thị: bản người dùng chọn nếu họ đã đụng vào, còn không thì bám theo server. */
  readonly draftCoverKey = computed(() =>
    this.coverTouched() ? this.coverChoice() : this.savedCoverKey(),
  );

  /** Danh sách hiển thị: tệp đã lưu (trừ tệp bị đánh dấu xoá) + tệp đang chờ tải lên. */
  readonly attachmentRows = computed<AttachmentRow[]>(() => {
    const removed = this.pendingRemovals();
    const coverKey = this.draftCoverKey();

    const saved: AttachmentRow[] = this.attachments()
      .filter((a) => !removed.has(a.id))
      .map((a) => ({
        key: `saved:${a.id}`,
        id: a.id,
        name: a.name,
        size: a.size,
        mimeType: a.mimeType,
        isImage: a.isImage,
        url: a.url,
        isCover: coverKey === `saved:${a.id}`,
        isPending: false,
      }));

    const pending: AttachmentRow[] = this.pendingFiles().map((p) => ({
      key: `new:${p.localId}`,
      id: null,
      name: p.name,
      size: p.size,
      mimeType: p.file.type,
      isImage: p.isImage,
      url: p.previewUrl,
      isCover: coverKey === `new:${p.localId}`,
      isPending: true,
    }));

    return [...saved, ...pending];
  });

  /** Dòng đang được chọn làm bìa — dải ảnh đầu modal xem trước theo BẢN NHÁP,
   *  nên chọn bìa mới (kể cả ảnh chưa tải lên) là thấy ngay, chưa cần lưu. */
  readonly coverRow = computed(() => this.attachmentRows().find((r) => r.isCover) ?? null);

  /** Có thay đổi đính kèm nào chưa lưu không? */
  private readonly attachmentsDirty = computed(
    () =>
      this.pendingFiles().length > 0 ||
      this.pendingRemovals().size > 0 ||
      (this.coverTouched() && this.coverChoice() !== this.savedCoverKey()),
  );
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

  /** Tệp quá nặng — báo ngay tại chỗ chọn, không đợi tới lúc lưu. */
  readonly attachmentError = signal<string | null>(null);

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    input.value = ''; // cho phép chọn lại cùng tệp
    if (!files.length) return;

    const quaNang = files.filter((f) => f.size > MAX_ATTACHMENT_BYTES);
    this.attachmentError.set(
      quaNang.length
        ? `${quaNang.map((f) => `"${f.name}"`).join(', ')} vượt quá ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB nên đã bị bỏ qua.`
        : null,
    );

    const them = files
      .filter((f) => f.size <= MAX_ATTACHMENT_BYTES)
      .map<PendingAttachment>((file) => ({
        localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        name: file.name,
        size: file.size,
        isImage: file.type.startsWith('image/'),
        previewUrl: URL.createObjectURL(file),
      }));

    if (them.length) {
      this.pendingFiles.update((list) => [...list, ...them]);

      // Khi thẻ chưa có ảnh bìa (cả server lẫn bản nháp) và có tệp ảnh mới được gắn vào:
      // Tự động tích hợp ảnh đầu tiên làm ảnh bìa cho thẻ ngay trong bản nháp.
      // Nếu thêm các hình khác sau đó, người dùng có thể tự điều chỉnh chọn hình khác theo ý muốn.
      if (!this.draftCoverKey()) {
        const firstImage = them.find((p) => p.isImage);
        if (firstImage) {
          this.coverTouched.set(true);
          this.coverChoice.set(`new:${firstImage.localId}`);
        }
      }
    }
  }

  /**
   * Bỏ một đính kèm khỏi danh sách.
   *
   * Tệp chưa lưu → gỡ khỏi bản nháp và thu hồi object URL luôn. Tệp đã lưu →
   * chỉ ĐÁNH DẤU xoá; lệnh xoá thật gửi đi lúc bấm Lưu, nên bấm nhầm vẫn hoàn
   * tác được bằng "Bỏ thay đổi".
   */
  removeAttachment(row: AttachmentRow): void {
    // Bỏ tệp đang là bìa thì bìa cũng phải bỏ theo, không để trỏ vào tệp không còn.
    if (this.draftCoverKey() === row.key) {
      this.coverTouched.set(true);
      this.coverChoice.set(null);
    }

    if (row.isPending) {
      const localId = row.key.slice('new:'.length);
      const bo = this.pendingFiles().find((p) => p.localId === localId);
      if (bo) URL.revokeObjectURL(bo.previewUrl);
      this.pendingFiles.update((list) => list.filter((p) => p.localId !== localId));
      return;
    }

    if (row.id) {
      this.pendingRemovals.update((s) => new Set(s).add(row.id as string));
    }
  }

  toggleCover(row: AttachmentRow): void {
    const dangLa = this.draftCoverKey() === row.key;
    this.coverTouched.set(true);
    this.coverChoice.set(dangLa ? null : row.key);
  }

  /**
   * Gửi mọi thay đổi đính kèm lên server. Chạy trong `save()`.
   *
   * Thứ tự bắt buộc: tải tệp mới lên TRƯỚC để lấy id thật, vì ảnh bìa có thể là
   * một tệp vừa chọn — lúc đó `draftCoverKey` mới quy ra được id để gọi API.
   */
  private async luuDinhKem(): Promise<void> {
    const cardId = this.card().id;
    const cho = this.pendingFiles();
    const coverKey = this.draftCoverKey();

    if (!cho.length && !this.pendingRemovals().size && !this.coverTouched()) return;

    let coverId: string | null = coverKey?.startsWith('saved:') ? coverKey.slice('saved:'.length) : null;

    if (cho.length) {
      const added = await this.attachmentService.addFiles(
        cardId,
        cho.map((p) => p.file),
      );
      for (const a of added) this.log(`attached "${a.name}"`);

      // Ghép tệp vừa tải lên với tệp đang chờ theo THỨ TỰ: `addFiles` trả về
      // đúng thứ tự nhận vào, nhưng bỏ qua tệp lỗi — nên dò theo tên+cỡ để
      // không gán nhầm bìa sang tệp khác khi có tệp hỏng ở giữa.
      if (coverKey?.startsWith('new:')) {
        const localId = coverKey.slice('new:'.length);
        const muon = cho.find((p) => p.localId === localId);
        coverId = added.find((a) => a.name === muon?.name && a.size === muon?.size)?.id ?? null;
      }

      for (const p of cho) URL.revokeObjectURL(p.previewUrl);
      this.pendingFiles.set([]);
    }

    const xoa = [...this.pendingRemovals()];
    for (const id of xoa) {
      const ten = this.attachments().find((a) => a.id === id)?.name ?? 'file';
      await this.attachmentService.remove(cardId, id);
      this.log(`removed attachment "${ten}"`);
    }
    if (xoa.length) this.pendingRemovals.set(new Set());

    // Bìa: CHỈ đụng tới khi người dùng thật sự đã bấm đổi bìa.
    //
    // Không có điều kiện `coverTouched()` ở đây thì lần đính ảnh đầu tiên bị gỡ
    // bìa oan: backend tự đặt ảnh đầu tiên của thẻ làm bìa, còn bản nháp lúc đó
    // vẫn mang giá trị "chưa có bìa" chụp từ TRƯỚC khi tải lên — so ra thấy khác
    // nên code lại gọi toggle để gỡ đúng cái bìa backend vừa đặt.
    if (this.coverTouched()) {
      const biaDangLuu = this.cover();
      if (coverId !== (biaDangLuu?.id ?? null)) {
        // Bỏ bìa cũ trước (API là "toggle", không phải "set"), rồi bật bìa mới.
        if (biaDangLuu && biaDangLuu.id !== coverId) {
          await this.attachmentService.toggleCover(cardId, biaDangLuu.id);
        }
        if (coverId) await this.attachmentService.toggleCover(cardId, coverId);
      }
    }

    // Về lại chế độ "bám theo server" — bản nháp bìa đã thành sự thật rồi.
    this.coverTouched.set(false);
    this.coverChoice.set(null);
  }

  /** Bỏ mọi đính kèm đang chờ và thu hồi object URL của chúng. */
  private xoaDinhKemChoLuu(): void {
    for (const p of this.pendingFiles()) URL.revokeObjectURL(p.previewUrl);
    this.pendingFiles.set([]);
    this.pendingRemovals.set(new Set());
    this.attachmentError.set(null);
    this.coverTouched.set(false);
    this.coverChoice.set(null);
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
