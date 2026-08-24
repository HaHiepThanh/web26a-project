import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { OrganizationStore } from '../ngrx/organization/organization.store';

/**
 * Chỉ cho owner truy cập hành động nhạy cảm: quản lý thành viên, xoá board/tổ chức (#7).
 * Dùng cho các route như /members. Backend (NestJS) vẫn phải kiểm tra lại — guard
 * frontend chỉ để ẩn UI, KHÔNG phải lớp bảo mật thật.
 */
export const roleGuard: CanActivateFn = (route, state) => {
  const organizations = inject(OrganizationStore);
  const router = inject(Router);

  // TODO: tìm vai trò của user hiện tại trong tổ chức đang mở;
  //       nếu role === 'owner' -> return true; ngược lại -> return router.parseUrl('/dashboard').
  return true;
};
