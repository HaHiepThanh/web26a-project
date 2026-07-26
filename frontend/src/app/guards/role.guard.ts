import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TenantService } from '../services/tenant.service';

/**
 * Chỉ cho owner truy cập hành động nhạy cảm: quản lý thành viên, xoá board/tenant (#7).
 * Dùng cho các route như /members. Backend (NestJS/RLS) vẫn phải kiểm tra lại — guard
 * frontend chỉ để ẩn UI, KHÔNG phải lớp bảo mật thật.
 */
export const roleGuard: CanActivateFn = (route, state) => {
  const tenant = inject(TenantService);
  const router = inject(Router);

  // TODO: tìm member của user hiện tại trong tenant.members();
  //       nếu role === 'owner' -> return true; ngược lại -> return router.parseUrl('/dashboard').
  return true;
};
