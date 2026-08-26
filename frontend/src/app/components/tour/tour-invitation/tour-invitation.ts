import { Component, computed, inject } from '@angular/core';
import { LucideCompass, LucideRocket, LucideX, LucideZap } from '@lucide/angular';
import { TourStore } from '../../../ngrx/tour/tour.store';
import { AuthService } from '../../../services/auth.service';

/**
 * Hộp thoại "Bạn có cần hướng dẫn không?".
 *
 * Hai điều chỉnh so với ý ban đầu, đã chốt trong đặc tả §4:
 *
 * 1. Hiện SAU khi vào workspace, không phải ngay sau đăng ký. Ngay sau đăng ký
 *    người dùng đang bị ép làm một việc bắt buộc (tạo Organization) — chen câu
 *    hỏi vào giữa là cắt ngang.
 *
 * 2. BA lựa chọn, không phải hai. "Có/Không" ép chọn giữa mười phút và không gì
 *    cả. Và "I'll explore myself" KHÔNG xoá đường quay lại: thanh checklist ở
 *    góc vẫn còn, mục "Restart tutorial" trong Cài đặt vẫn chạy lại được.
 */
@Component({
  selector: 'app-tour-invitation',
  imports: [LucideCompass, LucideRocket, LucideX, LucideZap],
  templateUrl: './tour-invitation.html',
})
export class TourInvitation {
  private readonly tour = inject(TourStore);
  private readonly auth = inject(AuthService);

  readonly isOpen = this.tour.invitationOpen;

  /** Đang dở giữa chừng → đổi lời mời thành "chạy tiếp" thay vì "bắt đầu". */
  readonly isResuming = computed(
    () => this.tour.onboarding().status === 'running',
  );

  readonly doneCount = this.tour.completedCount;
  readonly totalSteps = this.tour.totalSteps;

  /** Tên gọi thân mật: lấy chữ đầu của display name, rỗng thì thôi. */
  readonly firstName = computed(() => {
    const n = this.auth.currentUser()?.displayName?.trim();
    return n ? n.split(/\s+/)[0] : '';
  });

  onFull(): void {
    this.tour.start('full');
  }

  onBasics(): void {
    this.tour.start('basics');
  }

  onDecline(): void {
    this.tour.declineInvitation();
  }

  /** Bấm ra ngoài / nút X — đóng tạm, KHÔNG coi là từ chối. Lần sau vẫn hỏi. */
  onDismiss(): void {
    this.tour.closeInvitation();
  }
}
