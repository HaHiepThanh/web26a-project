import { Component, ElementRef, computed, effect, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideBuilding2, LucideCheck, LucideSparkles, LucideTriangleAlert, LucideX } from '@lucide/angular';
import { slugify, validateSlugFormat } from '../../../utils/slug.util';

@Component({
  selector: 'app-org-create-modal',
  imports: [FormsModule, LucideBuilding2, LucideCheck, LucideSparkles, LucideTriangleAlert, LucideX],
  templateUrl: './org-create-modal.html',
})
export class OrgCreateModal {
  readonly isOpen = input<boolean>(false);
  /** Hàm kiểm slug đã bị chiếm chưa — trang cha truyền vào (nguồn: OrganizationService). */
  readonly isSlugTaken = input<(slug: string) => boolean>(() => false);

  readonly close = output<void>();
  readonly createOrg = output<{ name: string; slug: string }>();

  private readonly nameInputField = viewChild<ElementRef<HTMLInputElement>>('nameInputField');

  readonly nameInput = signal('');
  readonly nameError = signal('' as string | null);
  readonly slugInput = signal('');
  /** true khi user đã tự sửa slug — lúc đó ngừng tự động ghi đè theo tên. */
  readonly slugTouched = signal(false);

  /** Lỗi định dạng / trùng lặp của slug, tính lại mỗi lần gõ. */
  readonly slugError = computed<string | null>(() => {
    const slug = this.slugInput();
    if (!slug) return null; // chưa gõ thì chưa báo lỗi, để onSubmit lo
    const formatError = validateSlugFormat(slug);
    if (formatError) return formatError;
    if (this.isSlugTaken()(slug)) return `The URL "${slug}" is already used by another organization!`;
    return null;
  });

  readonly slugOk = computed(() => !!this.slugInput() && !this.slugError());

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        this.nameInput.set('');
        this.nameError.set(null);
        this.slugInput.set('');
        this.slugTouched.set(false);
        setTimeout(() => this.nameInputField()?.nativeElement.focus(), 50);
      }
    });
  }

  /** Gõ tên thì tự gợi ý slug — nhưng thôi ghi đè ngay khi user tự sửa slug. */
  onNameChange(value: string): void {
    this.nameInput.set(value);
    this.nameError.set(null);
    if (!this.slugTouched()) this.slugInput.set(slugify(value));
  }

  /** Chuẩn hoá ngay khi gõ để user không tạo được slug sai định dạng (hoa, dấu, khoảng trắng). */
  onSlugChange(value: string): void {
    this.slugTouched.set(true);
    this.slugInput.set(slugify(value));
  }

  onSubmit(): void {
    const name = this.nameInput().trim();
    if (!name) {
      this.nameError.set('Please enter an Organization name!');
      return;
    }
    if (name.length > 50) {
      this.nameError.set('Organization name must be at most 50 characters!');
      return;
    }
    this.nameError.set(null);

    // Slug bắt buộc và phải hợp lệ — DB khai `not null unique`.
    const slug = this.slugInput().trim();
    if (!slug || this.slugError()) {
      this.slugTouched.set(true);
      if (!slug) this.slugInput.set(slugify(name));
      return;
    }

    this.createOrg.emit({ name, slug });
    this.close.emit();
  }
}
