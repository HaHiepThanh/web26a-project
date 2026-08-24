import { Component, computed, input } from '@angular/core';
import { Card, CardPriority, Label, User } from '../../../models';
import { avatarColorFor, initialsOf } from '../../../utils/avatar.util';

const PRIORITY_LABEL: Record<CardPriority, string> = { high: 'High', medium: 'Medium', low: 'Low' };
// Đã nâng độ sáng so với bản gốc (#BE123C/#B45309/#334155) — bản cũ chỉ đạt
// 1.5–3.2:1 tương phản trên nền card tối (oklch .253 .016 252.4 ≈ rgb(29,35,42)),
// dưới xa mức 4.5:1 của WCAG AA. Ba màu dưới đạt lần lượt ~5.1 / 6.8 / 6.2 : 1.
const PRIORITY_TEXT: Record<CardPriority, string> = { high: 'text-[#f43f5e]', medium: 'text-[#fb923c]', low: 'text-[#94a3b8]' };

/** Hình cờ dùng chung cho mức ưu tiên (#4, phương án A đã chốt trong demo 04):
 *  high = tô đặc, medium = tô nửa (clip trái), low = chỉ viền. */
export const FLAG_PATH = 'M5 21V4a1 1 0 011-1h11.4a1 1 0 01.8 1.6L15 9l3.2 4.4a1 1 0 01-.8 1.6H6v6z';

let clipSeq = 0;

/** Thẻ tóm tắt trong 1 cột: cờ ưu tiên (#4, hàng riêng) + nhãn màu (#5, nhiều nhãn) +
 *  tiêu đề, hạn chót, avatar phụ trách. Thuần hiển thị — cdkDrag/cdkDropList gắn ở BoardList (cha). */
@Component({
  selector: 'app-card-item',
  imports: [],
  templateUrl: './card-item.html',
  styleUrl: './card-item.css',
})
export class CardItem {
  readonly card = input.required<Card>();
  readonly labels = input<Label[]>([]);
  readonly assignee = input<User | null>(null);
  /** URL ảnh bìa (base64) — hiển thị ngay trên mặt thẻ nếu có, lấy từ AttachmentService. */
  readonly coverUrl = input<string | null>(null);
  readonly isSaving = input(false);
  readonly isError = input(false);
  readonly isDimmed = input(false);
  readonly isHighlighted = input(false);
  /** Đang được chọn trong chế độ multi-select (#12, Shift+click). */
  readonly isSelected = input(false);
  readonly today = input<string>('');
  /** [BONUS #4] Tiến độ checklist (done/total) — null/total=0 nghĩa là chưa có checklist. */
  readonly checklistProgress = input<{ done: number; total: number } | null>(null);
  /** [BONUS #4] Số bình luận — 0 nghĩa là chưa có bình luận nào. */
  readonly commentCount = input(0);

  readonly flagPath = FLAG_PATH;
  readonly clipId = `flag-clip-${clipSeq++}`;

  readonly priorityText = computed(() => PRIORITY_LABEL[this.card().priority]);
  readonly priorityColorClass = computed(() => PRIORITY_TEXT[this.card().priority]);

  readonly dueText = computed(() => {
    const due = this.card().dueDate;
    if (!due) return null;
    const [, m, d] = due.split('-');
    return `${d}/${m}`;
  });

  readonly isOverdue = computed(() => {
    const due = this.card().dueDate;
    const today = this.today();
    if (!due || !today) return false;
    return due < today;
  });

  readonly assigneeInitials = computed(() => {
    const a = this.assignee();
    return a ? initialsOf(a.displayName ?? a.email) : '';
  });

  readonly assigneeColor = computed(() => {
    const a = this.assignee();
    return a ? avatarColorFor(a.id) : 'transparent';
  });

  /** Có ít nhất 1 dấu hiệu meta (mô tả/checklist/bình luận) để hiện hàng icon — tránh
   *  render hàng rỗng tốn khoảng trắng cho những thẻ chưa có gì thêm ngoài tiêu đề. */
  readonly hasMeta = computed(() => !!this.card().description || (this.checklistProgress()?.total ?? 0) > 0 || this.commentCount() > 0);
}
