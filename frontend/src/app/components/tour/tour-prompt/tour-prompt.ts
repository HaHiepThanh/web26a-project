import { Component, computed, inject } from '@angular/core';
import { LucideSparkles, LucideTrash2 } from '@lucide/angular';
import { TourStore } from '../../../ngrx/tour/tour.store';

/**
 * Hai câu hỏi kẹp hai đầu tầng 2: "gieo thẻ mẫu nhé?" và "dọn đi nhé?".
 *
 * Một component hai chế độ chứ không phải hai component: chúng giống hệt nhau
 * về bố cục và hành vi, chỉ khác chữ và biểu tượng.
 *
 * Vì sao phải HỎI ở cả hai đầu:
 *
 *   - Đầu vào: gieo 8 thẻ vào board của người ta mà không xin phép là tự tiện,
 *     nhất là khi board đó có thể đã có đồng đội đang nhìn.
 *   - Đầu ra: dọn hộ ngầm thì người vừa thấy thích mấy thẻ mẫu sẽ mất chúng mà
 *     không hiểu vì sao. Bỏ mặc thì board thật của họ dính 8 thẻ rác mãi mãi.
 *     Cả hai đều tệ hơn một câu hỏi.
 */
@Component({
  selector: 'app-tour-prompt',
  imports: [LucideSparkles, LucideTrash2],
  templateUrl: './tour-prompt.html',
})
export class TourPrompt {
  private readonly tour = inject(TourStore);

  readonly seedOpen = this.tour.seedOfferOpen;
  readonly cleanupOpen = this.tour.cleanupOfferOpen;
  readonly busy = this.tour.seedBusy;

  readonly isOpen = computed(() => this.seedOpen() || this.cleanupOpen());

  onYes(): void {
    if (this.seedOpen()) void this.tour.acceptSeed();
    else void this.tour.acceptCleanup();
  }

  onNo(): void {
    if (this.seedOpen()) this.tour.declineSeed();
    else this.tour.declineCleanup();
  }
}
