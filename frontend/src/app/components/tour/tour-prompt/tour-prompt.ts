import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
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

  /**
   * Có hộp thoại nào KHÁC của app đang mở không.
   *
   * Bấm "Add card" ở bước 4 thì app vừa tạo thẻ vừa mở luôn modal chi tiết thẻ.
   * Tour thấy số thẻ tăng nên bật hộp "thêm 8 thẻ mẫu?" ngay lập tức — thành hai
   * hộp thoại chồng nhau, người dùng chưa kịp nhìn cái thẻ mình vừa tạo đã bị
   * hỏi một câu khác.
   *
   * Chờ họ đóng modal kia rồi mới hỏi. Câu hỏi không mất đi đâu cả: state vẫn
   * là `seedOfferOpen`, chỉ là chưa vẽ.
   */
  private readonly otherModal = signal(false);
  readonly otherModalOpen = this.otherModal.asReadonly();

  constructor() {
    // `:not(.tour-prompt-modal)` để không tự đếm chính mình — hộp này cũng dùng
    // lớp `.modal-open`, thiếu bộ lọc là nó tự ẩn ngay khi vừa hiện.
    const sync = () =>
      this.otherModal.set(
        document.querySelector('.modal-open:not(.tour-prompt-modal)') !== null,
      );
    const obs = new MutationObserver(sync);
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    sync();
    inject(DestroyRef).onDestroy(() => obs.disconnect());
  }

  onYes(): void {
    if (this.seedOpen()) void this.tour.acceptSeed();
    else void this.tour.acceptCleanup();
  }

  onNo(): void {
    if (this.seedOpen()) this.tour.declineSeed();
    else this.tour.declineCleanup();
  }
}
