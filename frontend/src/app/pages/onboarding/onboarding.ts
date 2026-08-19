import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideBuilding2, LucideCheck, LucideLogOut, LucideSparkles, LucideTriangleAlert } from '@lucide/angular';
import { AuthService } from '../../services/auth.service';
import { OrganizationService } from '../../services/organization.service';
import { isSlugTaken } from '../../mocks';
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

  readonly slugError = computed<string | null>(() => {
    const slug = this.slugInput();
    if (!slug) return null;
    const formatError = validateSlugFormat(slug);
    if (formatError) return formatError;
    if (isSlugTaken(slug)) return `Đường dẫn "${slug}" đã có tổ chức khác dùng rồi!`;
    return null;
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

  onSubmit(): void {
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
    const org = this.orgService.createOrg(name, slug);
    if (!org) {
      // Tab khác vừa chiếm mất slug giữa lúc gõ và lúc bấm Tạo.
      this.submitting.set(false);
      this.slugTouched.set(true);
      this.slugInput.set(slugify(slug)); // ép tính lại slugError để hiện thông báo
      return;
    }
    void this.router.navigate(['/', org.slug, 'workspace']);
  }

  /** Phải có, nếu không user đăng nhập nhầm tài khoản sẽ bị kẹt cứng ở màn này. */
  async onLogout(): Promise<void> {
    await this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
