import { Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideTriangleAlert } from '@lucide/angular';
import { WorkspaceItem } from '../../../mocks';

/**
 * Hộp thoại xác nhận xoá Workspace — phải gõ lại ĐÚNG tên mới bấm được Delete.
 *
 * ⚠️ Vì sao tách hẳn ra một modal riêng thay vì đổi nhãn nút tại chỗ?
 *    Bản trước dùng đúng MỘT nút cho cả hai bước: bấm lần đầu đổi chữ thành
 *    "Confirm delete?", bấm lần hai là xoá thật. Hai lần bấm đó nằm cùng một
 *    toạ độ, nên một cú double-click bình thường đi trọn cả hai bước — workspace
 *    bay mất trước khi người dùng kịp đọc chữ trên nút. Modal riêng cắt đứt
 *    đường đó: cú click thứ hai rơi vào nền modal vừa hiện, không phải vào nút
 *    xoá, và nút xoá thì vẫn khoá cho tới khi gõ đúng tên.
 */
@Component({
  selector: 'app-workspace-delete-modal',
  imports: [FormsModule, LucideTriangleAlert],
  templateUrl: './workspace-delete-modal.html',
})
export class WorkspaceDeleteModal {
  readonly isOpen = input<boolean>(false);
  readonly workspace = input<WorkspaceItem | null>(null);
  /** Đang gọi API xoá — khoá nút và mọi đường đóng modal. */
  readonly deleting = input<boolean>(false);
  readonly error = input<string | null>(null);

  readonly cancel = output<void>();
  readonly confirm = output<void>();

  /** Chuỗi người dùng gõ. Giữ NGUYÊN VĂN, không trim, không đổi hoa thường. */
  readonly typed = signal('');

  readonly expectedName = computed(() => this.workspace()?.name ?? '');

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
    // Mỗi lần mở lại (hoặc đổi sang workspace khác) phải gõ lại từ đầu — không
    // để sót chữ của lần mở trước làm nút Delete sáng sẵn.
    effect(() => {
      if (!this.isOpen()) return;
      this.workspace();
      this.typed.set('');
      this.openedAt = Date.now();
    });
  }

  /**
   * Bấm ra nền để đóng — nhưng BỎ QUA cú bấm đến ngay sau lúc modal vừa hiện.
   *
   * ⚠️ Không có chốt này thì double-click lên nút "Delete Workspace" trông như
   *    nút bị liệt: cú bấm thứ nhất mở hộp thoại, cú thứ hai rơi trúng nền vừa
   *    hiện lên ngay dưới con trỏ và đóng nó lại. Không mất dữ liệu, nhưng người
   *    dùng sẽ bấm lại mãi mà tưởng chức năng hỏng. Nút nằm ở đâu trên màn hình
   *    quyết định có dính hay không, nên chặn ở đây cho chắc.
   */
  onBackdropClick(): void {
    if (Date.now() - this.openedAt < 400) return;
    this.requestCancel();
  }

  /**
   * Nút X / bấm nền — cùng một đường thoát, và đều KHÔNG xoá gì cả.
   *
   * Phím Esc CỐ Ý không bắt ở đây: trang Workspace đã có sẵn một handler Esc ở
   * `window` cho mọi modal. Bắt thêm ở `document` thì cả hai cùng chạy — cái ở
   * document đóng hộp thoại này trước, rồi cái ở window thấy cờ đã tắt nên đóng
   * nốt modal Edit phía dưới, cuốn theo phần người dùng đang sửa dở.
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
