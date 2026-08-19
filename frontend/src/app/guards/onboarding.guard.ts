import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { OrganizationService } from '../services/organization.service';

/**
 * Chặn vào app khi user chưa có Organization nào → đưa sang /onboarding.
 *
 * Mọi Workspace/Board đều thuộc về một tổ chức, nên không có tổ chức thì app
 * không có gì để hiển thị. Trước đây `loadOrganizationsForUser()` tự tạo ngầm một
 * tổ chức mặc định để né việc này, nhưng như vậy user bị gán cứng một slug vĩnh
 * viễn mà họ chưa từng thấy — nay để họ tự chọn ở màn onboarding.
 */
export const onboardingGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const orgService = inject(OrganizationService);
  const router = inject(Router);

  if (!auth.currentUser()) return router.createUrlTree(['/login']);

  // Guard chạy trước effect nạp dữ liệu ở lần tải trang đầu → phải ép nạp.
  orgService.ensureLoaded();

  if (orgService.organizations().length === 0) return router.createUrlTree(['/onboarding']);
  return true;
};

/**
 * Ngược lại: user ĐÃ có tổ chức thì không cho quay lại /onboarding nữa
 * (tránh vô tình tạo thêm tổ chức thừa khi bấm nút Back).
 */
export const onboardingDoneGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const orgService = inject(OrganizationService);
  const router = inject(Router);

  if (!auth.currentUser()) return router.createUrlTree(['/login']);

  orgService.ensureLoaded();

  const slug = orgService.activeOrgSlug();
  if (slug) return router.createUrlTree(['/', slug, 'workspace']);
  return true;
};
