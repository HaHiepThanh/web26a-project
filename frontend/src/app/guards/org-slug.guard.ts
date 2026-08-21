import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { OrganizationService } from '../services/organization.service';

/**
 * Route dạng /:orgSlug/... — đổi slug trên URL thành tổ chức đang chọn.
 *
 * Đây là điểm mấu chốt khiến link chia sẻ hoạt động đúng: người nhận có thể đang
 * mở một tổ chức khác, guard này chuyển họ sang đúng tổ chức của link TRƯỚC khi
 * trang được dựng, thay vì hiển thị dữ liệu của tổ chức sai.
 */
export const orgSlugGuard: CanActivateFn = async (route) => {
  const orgService = inject(OrganizationService);
  const router = inject(Router);

  // Danh sách tổ chức lấy từ backend → phải chờ nạp xong mới tra được slug.
  await orgService.ensureLoaded();

  const slug = route.paramMap.get('orgSlug') ?? '';
  const org = orgService.orgBySlug(slug);

  // Không tìm thấy slug → 404. Hai trường hợp gộp làm một cách CỐ Ý: slug không
  // tồn tại, và slug có thật nhưng người này không thuộc tổ chức đó. Phân biệt
  // hai cái là vô tình xác nhận "tổ chức này có thật" cho người ngoài.
  if (!org) return router.createUrlTree(['/not-found']);

  if (orgService.activeOrgId() !== org.id) orgService.switchOrg(org.id);
  return true;
};

/**
 * Các link cũ dạng /workspace (header, footer, sau khi đăng nhập) chưa biết slug.
 * Guard này đưa về đúng /:slug/workspace của tổ chức đang chọn.
 */
export const orgRedirectGuard: CanActivateFn = async () => {
  const orgService = inject(OrganizationService);
  const router = inject(Router);

  await orgService.ensureLoaded();

  const slug = orgService.activeOrgSlug();
  // Chưa có tổ chức nào → để onboardingGuard xử lý ở /onboarding.
  if (!slug) return router.createUrlTree(['/onboarding']);

  return router.createUrlTree(['/', slug, 'workspace']);
};
