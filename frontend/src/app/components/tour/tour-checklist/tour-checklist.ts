import { Component, computed, inject } from '@angular/core';
import { LucideChevronDown, LucideCheck, LucidePlay, LucideX } from '@lucide/angular';
import { TourStore } from '../../../ngrx/tour/tour.store';
import { TOUR_STEPS } from '../../../ngrx/tour/tour.steps';

/**
 * Thanh "Getting started — 2/4" ở góc dưới-trái.
 *
 * Đây là đường quay lại sau khi người dùng bấm "I'll explore myself". Không có
 * nó thì chữ "Không" trở thành vĩnh viễn, và đó là lỗi thiết kế phổ biến nhất
 * của onboarding — người ta từ chối ở phút đầu vì đang vội, rồi không bao giờ
 * tìm lại được.
 *
 * Góc dưới-TRÁI chứ không phải phải: góc dưới-phải đã dành cho linh vật chào
 * (docs/LINH-VAT-CHAO-NGUOI-DUNG.md §3), và ở trang Board thì góc đó là
 * `chat-mobile-fab`.
 */
@Component({
  selector: 'app-tour-checklist',
  imports: [LucideCheck, LucideChevronDown, LucidePlay, LucideX],
  templateUrl: './tour-checklist.html',
  styleUrl: './tour-checklist.css',
})
export class TourChecklist {
  private readonly tour = inject(TourStore);

  readonly visible = this.tour.checklistVisible;
  readonly collapsed = this.tour.checklistCollapsed;
  readonly doneCount = this.tour.completedCount;
  readonly total = this.tour.totalSteps;

  readonly steps = computed(() => {
    const done = this.tour.onboarding().completed;
    return TOUR_STEPS.map((s) => ({
      id: s.id,
      title: s.title,
      done: done.includes(s.id),
    }));
  });

  readonly percent = computed(() =>
    Math.round((this.doneCount() / this.total()) * 100),
  );

  onToggle(): void {
    this.tour.toggleChecklist();
  }

  onResume(): void {
    this.tour.start('full');
  }

  /** Ẩn hẳn thanh này. KHÔNG dùng `finish()` — xem ghi chú ở `dismissChecklist()`. */
  onDismiss(): void {
    this.tour.dismissChecklist();
  }
}
