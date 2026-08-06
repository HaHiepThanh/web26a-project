import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TenantService } from '../services/tenant.service';

/**
 * Đảm bảo user đã có tenant trước khi vào app (#1).
 * Nếu chưa có tenant -> chuyển sang /onboarding để đặt tên công ty/team.
 */
export const onboardingGuard: CanActivateFn = (route, state) => {
  const tenant = inject(TenantService);
  const router = inject(Router);

  // TODO: nếu tenant.currentTenant() tồn tại -> return true;
  //       ngược lại -> return router.parseUrl('/onboarding');
  return true;
};
