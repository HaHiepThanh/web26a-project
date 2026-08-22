import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideBuilding2, LucideCheck, LucideLogOut, LucideSparkles, LucideTriangleAlert } from '@lucide/angular';
import { AuthService } from '../../services/auth.service';
import { OrganizationService } from '../../services/organization.service';

import { SLUG_MAX_LENGTH, slugify, validateSlugFormat } from '../../utils/slug.util';

/**
 * Màn khởi động sau lần đăng nhập đầu tiên: user BẮT BUỘC tạo Organization
 * trước khi vào app (mọi Workspace/Board đều thuộc về một tổ chức).
 *
 * Vì sao bắt user tự gõ đường dẫn ở đây thay vì sinh tự động?
 * Slug là VĨNH VIỄN — không cho đổi sau khi tạo. Sinh ngầm nghĩa là gán cứng cho
 * user một URL xấu mà họ chưa từng nhìn thấy.
 */
@Component({
  selector: 'app-onboarding',
  imports: [FormsModule, LucideBuilding2, LucideCheck, LucideLogOut, LucideSparkles, LucideTriangleAlert],
  templateUrl: './onboarding.html',
  host: { class: 'block min-h-screen bg-base-200' },
})
export class Onboarding {
  private readonly auth = inject(AuthService);
  private readonly orgService = inject(OrganizationService);
  private readonly router = inject(Router);

  readonly currentUser = this.auth.currentUser;

  /**
   * Lời mời đang chờ — hiện NGAY tại màn này.
   *
   * ⚠️ Người vừa được mời mà chưa thuộc tổ chức nào sẽ bị `onboardingGuard` đưa
   *    thẳng tới đây. Trước đây màn này chỉ có ô "Tạo tổ chức", nên họ không có
   *    cách nào đồng ý lời mời — phải tự tạo một tổ chức rỗng rồi mới vào được
   *    app để bấm chuông. Danh sách này tự cập nhật qua WebSocket.
   */
  readonly invites = this.orgService.myInvites;
  readonly respondingId = signal<string | null>(null);
  readonly maxSlug = SLUG_MAX_LENGTH;

  /** Tên đăng nhập dùng làm gốc cho cả tên tổ chức lẫn đường dẫn gợi ý. */
  private readonly username = computed(() => {
    const u = this.currentUser();
    return u?.username?.trim() || u?.displayName?.trim() || u?.email?.split('@')[0] || 'my';
  });

  readonly nameInput = signal('');
  readonly slugInput = signal('');
  readonly nameError = signal<string | null>(null);
  readonly slugTouched = signal(false);
  readonly submitting = signal(false);

  /** Lỗi backend trả về, gắn với ĐÚNG slug đã gửi đi. Người dùng sửa slug khác
   *  là lỗi tự biến mất, không phải bấm gì để xoá. */
  private readonly serverError = signal<{ slug: string; message: string } | null>(null);

  readonly slugError = computed<string | null>(() => {
    const slug = this.slugInput();
    if (!slug) return null;
    const formatError = validateSlugFormat(slug);
    if (formatError) return formatError;
    // Slug có bị chiếm chưa thì CHỈ backend biết — nó giữ toàn bộ tổ chức của mọi
    // người, còn trình duyệt này chỉ thấy tổ chức của chính user đang đăng nhập.
    const se = this.serverError();
    return se && se.slug === slug ? se.message : null;
  });

  readonly slugOk = computed(() => !!this.slugInput() && !this.slugError());

  constructor() {
    // Gợi ý sẵn. LƯU Ý: tên và đường dẫn lấy từ 2 NGUỒN KHÁC NHAU —
    // slug sinh từ "<username>'s Organization" sẽ ra 25-26 ký tự (vượt giới hạn
    // 30 với username dài) rồi bị cắt cụt thành rác kiểu 'nam-nguyen-s-organiz'.
    // Lấy slug từ mỗi username cho ra 'nam-nguyen' — ngắn, sạch, có nghĩa.
    const u = this.username();
    this.nameInput.set(`${u}'s Organization`);
    this.slugInput.set(slugify(u));
  }

  onNameChange(value: string): void {
    this.nameInput.set(value);
    this.nameError.set(null);
  }

  onSlugChange(value: string): void {
    this.slugTouched.set(true);
    this.slugInput.set(slugify(value));
  }

  async onSubmit(): Promise<void> {
    const name = this.nameInput().trim();
    if (!name) {
      this.nameError.set('Vui lòng nhập tên tổ chức!');
      return;
    }
    if (name.length > 50) {
      this.nameError.set('Tên tổ chức tối đa 50 ký tự!');
      return;
    }
    this.nameError.set(null);

    const slug = this.slugInput().trim();
    if (!slug || this.slugError()) {
      this.slugTouched.set(true);
      return;
    }

    this.submitting.set(true);
    // Backend là nơi duy nhất biết chắc slug còn trống hay không — nó trả 409
    // kèm câu tiếng Việt sẵn, cứ hiển thị nguyên văn.
    const { org, error } = await this.orgService.createOrg(name, slug);
    if (!org) {
      this.submitting.set(false);
      this.slugTouched.set(true);
      this.serverError.set({ slug, message: error ?? 'Không tạo được tổ chức, thử lại giúp mình.' });
      return;
    }
    void this.router.navigate(['/', org.slug, 'workspace']);
  }

  /** Phải có, nếu không user đăng nhập nhầm tài khoản sẽ bị kẹt cứng ở màn này. */
  async onLogout(): Promise<void> {
    await this.auth.logout();
    void this.router.navigateByUrl('/login');
  }

  /** Đồng ý lời mời → vào thẳng app, khỏi phải tạo tổ chức rỗng. */
  async acceptInvite(inviteId: string): Promise<void> {
    this.respondingId.set(inviteId);
    const error = await this.orgService.respondInvite(inviteId, true);
    this.respondingId.set(null);
    if (error) {
      this.nameError.set(error);
      return;
    }
    await this.router.navigateByUrl('/workspace');
  }

  async declineInvite(inviteId: string): Promise<void> {
    this.respondingId.set(inviteId);
    await this.orgService.respondInvite(inviteId, false);
    this.respondingId.set(null);
  }
}
