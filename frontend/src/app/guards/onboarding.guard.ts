import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { OrganizationService } from '../services/organization.service';

/**
 * Chặn vào app khi user chưa có tổ chức nào → đưa sang /onboarding.
 *
 * Mọi Workspace/Board đều thuộc về một tổ chức, nên không có tổ chức thì app
 * không có gì để hiển thị.
 *
 * ⚠️ Guard này BẤT ĐỒNG BỘ vì danh sách tổ chức giờ lấy từ backend. Bỏ `await`
 *    là guard đọc phải mảng rỗng ở lần tải trang đầu và đá thẳng người đã có tổ
 *    chức sang /onboarding — lỗi rất khó lần ra vì F5 lần hai lại đúng.
 */
export const onboardingGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const orgService = inject(OrganizationService);
  const router = inject(Router);

  if (!auth.currentUser()) return router.createUrlTree(['/login']);

  await orgService.ensureLoaded();

  // Gọi API hỏng (mất mạng, backend chưa chạy) thì ĐỪNG đá sang onboarding:
  // người dùng sẽ tưởng mất sạch tổ chức và tạo thêm cái mới. Cho vào app,
  // trang tự hiện banner lỗi.
  if (orgService.loadError()) return true;

  if (orgService.organizations().length === 0) return router.createUrlTree(['/onboarding']);
  return true;
};

/**
 * Ngược lại: user ĐÃ có tổ chức thì không cho quay lại /onboarding nữa
 * (tránh vô tình tạo thêm tổ chức thừa khi bấm nút Back).
 */
export const onboardingDoneGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const orgService = inject(OrganizationService);
  const router = inject(Router);

  if (!auth.currentUser()) return router.createUrlTree(['/login']);

  await orgService.ensureLoaded();

  const slug = orgService.activeOrgSlug();
  if (slug) return router.createUrlTree(['/', slug, 'workspace']);
  return true;
};
