import { Component, computed, inject, input, signal } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { avatarColorFor, initialsOf } from '../../../utils/avatar.util';

/**
 * Ảnh đại diện dùng chung cho MỌI nơi trong app.
 *
 * Vì sao gom về một component thay vì mỗi chỗ tự vẽ?
 *
 * 1. TRƯỚC ĐÂY hầu hết các chỗ (chat, bình luận, người phụ trách thẻ, danh sách
 *    thành viên tổ chức/workspace...) chỉ vẽ chữ cái đầu tô màu, KHÔNG hề đọc
 *    tới `avatarUrl` — dù backend đã trả sẵn ở mọi endpoint. Người dùng đổi ảnh
 *    xong chỉ thấy nó ở trang Hồ sơ với Header, còn lại vẫn là hai chữ cái, nên
 *    tưởng "đổi ảnh không ăn".
 *
 * 2. Ảnh của CHÍNH MÌNH luôn đọc từ `AuthService` chứ không tin bản sao trong
 *    dữ liệu truyền vào (xem `resolvedUrl`). Các store giữ bản chụp lúc nạp
 *    (`membersByOrg`, `comments[].user`, `messages[].user`...); đổi ảnh xong
 *    những bản chụp đó vẫn mang link cũ cho tới khi nạp lại trang. Đọc đè từ
 *    một nguồn sống khiến ảnh mới hiện ngay ở mọi chỗ, không cần F5 và không
 *    phải đi nạp lại từng store.
 */
@Component({
  selector: 'app-user-avatar',
  imports: [],
  templateUrl: './user-avatar.html',
  styleUrl: './user-avatar.css',
})
export class UserAvatar {
  private readonly auth = inject(AuthService);

  readonly userId = input.required<string>();
  /** Tên để lấy chữ cái đầu khi không có ảnh (và làm tooltip). */
  readonly name = input('');
  /** Ảnh kèm theo dữ liệu gọi tới. Của chính mình thì bị `resolvedUrl` bỏ qua. */
  readonly avatarUrl = input<string | null | undefined>(undefined);
  /** Cạnh ô vuông, tính bằng px — các chỗ gọi đang dùng từ 22px tới 40px. */
  readonly size = input(24);
  /** Bo tròn hẳn hay chỉ bo góc (Header thu gọn dùng góc bo). */
  readonly square = input(false);
  /** Class bố cục của chỗ gọi (vd `-ml-2` cho chồng avatar), ghép thêm vào ngoài. */
  readonly extraClass = input('');

  /**
   * Ảnh nào thực sự được vẽ.
   *
   * Của mình → luôn lấy bản mới nhất từ `AuthService`; của người khác → dùng
   * đúng thứ chỗ gọi đưa vào.
   */
  readonly resolvedUrl = computed(() => {
    const me = this.auth.currentUser();
    if (me && me.id === this.userId()) return me.avatarUrl ?? null;
    return this.avatarUrl() ?? null;
  });

  /**
   * Link đã tải hỏng.
   *
   * Cố ý lưu CHÍNH LINK chứ không phải cờ `true/false`: link Google/Supabase
   * thỉnh thoảng lỗi (bị giới hạn tần suất, ảnh vừa bị thay). Cờ boolean một khi
   * bật là tắt ảnh vĩnh viễn — đổi ảnh mới cũng không hiện lại, vì không có gì
   * đặt nó về `false`. So theo link thì ảnh mới là một link khác nên tự thử lại.
   */
  private readonly failedUrl = signal<string | null>(null);

  readonly showImage = computed(() => {
    const url = this.resolvedUrl();
    return !!url && url !== this.failedUrl();
  });

  readonly label = computed(() => this.name() || '?');
  readonly initials = computed(() => initialsOf(this.label()));
  readonly color = computed(() => avatarColorFor(this.userId()));
  /** Chữ cái đầu co theo khung, tối thiểu 9px cho vẫn đọc được ở avatar 22px. */
  readonly fontSize = computed(() => Math.max(9, Math.round(this.size() * 0.4)));

  onError(): void {
    this.failedUrl.set(this.resolvedUrl());
  }
}
