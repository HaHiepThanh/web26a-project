import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { OrganizationService } from '../services/organization.service';

/**
 * Route dạng /:orgSlug/... — đổi slug trên URL thành Organization đang chọn.
 *
 * Đây là điểm mấu chốt khiến link chia sẻ hoạt động đúng: người nhận có thể đang
 * mở một Organization khác, guard này chuyển họ sang đúng Organization của link
 * TRƯỚC khi trang được dựng, thay vì hiển thị dữ liệu của tổ chức sai.
 */
export const orgSlugGuard: CanActivateFn = (route) => {
  const orgService = inject(OrganizationService);
  const router = inject(Router);

  // Guard chạy trước effect nạp dữ liệu ở lần tải trang đầu → phải ép nạp.
  orgService.ensureLoaded();

  const slug = route.paramMap.get('orgSlug') ?? '';
  const org = orgService.orgBySlug(slug);

  // Slug không tồn tại (gõ sai / tổ chức đã bị xoá) → 404, đừng im lặng đưa về
  // tổ chức khác vì như vậy user tưởng mình đang xem đúng nơi.
  if (!org) return router.createUrlTree(['/not-found']);

  if (orgService.activeOrgId() !== org.id) orgService.switchOrg(org.id);
  return true;
};

/**
 * Các link cũ dạng /workspace (header, footer, sau khi đăng nhập) chưa biết slug.
 * Guard này đưa về đúng /:slug/workspace của tổ chức đang chọn.
 */
export const orgRedirectGuard: CanActivateFn = () => {
  const orgService = inject(OrganizationService);
  const router = inject(Router);

  // Guard chạy trước effect nạp dữ liệu ở lần tải trang đầu → phải ép nạp.
  orgService.ensureLoaded();

  const slug = orgService.activeOrgSlug();
  // Chưa đăng nhập / chưa có tổ chức nào → để nguyên cho auth guard xử lý.
  if (!slug) return router.createUrlTree(['/login']);

  return router.createUrlTree(['/', slug, 'workspace']);
};
