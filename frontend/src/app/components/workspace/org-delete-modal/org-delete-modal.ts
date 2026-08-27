import { Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideTriangleAlert } from '@lucide/angular';
import { Organization } from '../../../models';

/**
 * Hộp thoại xác nhận xoá Tổ chức — phải gõ lại ĐÚNG tên mới bấm được Delete.
 *
 * Cùng khuôn với `WorkspaceDeleteModal`, nhưng hậu quả nặng hơn hẳn một bậc: xoá
 * tổ chức là quét sạch MỌI workspace, board, thẻ, bình luận và tin nhắn bên
 * trong nó. Vì vậy modal này nói thẳng con số (bao nhiêu workspace, bao nhiêu
 * thành viên) trước khi người dùng gõ tên.
 *
 * Dùng chung cho cả hai lối vào: modal "Manage organization" và trang Cài đặt.
 */
@Component({
  selector: 'app-org-delete-modal',
  imports: [FormsModule, LucideTriangleAlert],
  templateUrl: './org-delete-modal.html',
})
export class OrgDeleteModal {
  readonly isOpen = input<boolean>(false);
  readonly org = input<Organization | null>(null);
  /**
   * Số workspace sẽ mất theo, để cảnh báo nói bằng con số cụ thể.
   * `null` = không rõ (tổ chức không phải cái đang mở) → nói chung chung thay vì
   * bịa ra một con số.
   */
  readonly workspaceCount = input<number | null>(null);
  /** Đang gọi API xoá — khoá nút và mọi đường đóng modal. */
  readonly deleting = input<boolean>(false);
  readonly error = input<string | null>(null);

  readonly cancel = output<void>();
  readonly confirm = output<void>();

  /** Chuỗi người dùng gõ. Giữ NGUYÊN VĂN, không trim, không đổi hoa thường. */
  readonly typed = signal('');

  readonly expectedName = computed(() => this.org()?.name ?? '');
  readonly memberCount = computed(() => this.org()?.memberIds?.length ?? 0);

  /**
   * So khớp tuyệt đối, phân biệt hoa thường, không fuzzy.
   *
   * Cố ý KHÔNG trim: nếu bỏ khoảng trắng thừa giúp người dùng vượt ải dễ hơn thì
   * bước xác nhận mất đúng cái tác dụng nó sinh ra để làm.
   */
  readonly canDelete = computed(
    () => this.expectedName().length > 0 && this.typed() === this.expectedName(),
  );

  /** Mốc thời gian modal vừa mở — xem `onBackdropClick`. */
  private openedAt = 0;

  constructor() {
    // Mỗi lần mở lại (hoặc đổi sang tổ chức khác) phải gõ lại từ đầu — không để
    // sót chữ của lần mở trước làm nút Delete sáng sẵn.
    effect(() => {
      if (!this.isOpen()) return;
      this.org();
      this.typed.set('');
      this.openedAt = Date.now();
    });
  }

  /**
   * Bấm ra nền để đóng — nhưng BỎ QUA cú bấm đến ngay sau lúc modal vừa hiện.
   *
   * ⚠️ Không có chốt này thì double-click lên nút "Delete Organization" trông
   *    như nút bị liệt: cú bấm thứ nhất mở hộp thoại, cú thứ hai rơi trúng nền
   *    vừa hiện lên ngay dưới con trỏ và đóng nó lại — nhanh tới mức người dùng
   *    không kịp thấy gì. Không mất dữ liệu, nhưng họ sẽ bấm lại mãi mà tưởng
   *    chức năng hỏng.
   */
  onBackdropClick(): void {
    if (Date.now() - this.openedAt < 400) return;
    this.requestCancel();
  }

  /**
   * Nút X / bấm nền — cùng một đường thoát, và đều KHÔNG xoá gì cả.
   *
   * Phím Esc cố ý không bắt ở đây; trang chứa modal tự lo, xem ghi chú cùng chỗ
   * trong `WorkspaceDeleteModal`.
   */
  requestCancel(): void {
    if (this.deleting()) return;
    this.cancel.emit();
  }

  /** Chốt chặn cuối ở phía component: gõ chưa đúng, hoặc đang xoá dở → không phát lệnh. */
  submit(): void {
    if (!this.canDelete() || this.deleting()) return;
    this.confirm.emit();
  }
}
