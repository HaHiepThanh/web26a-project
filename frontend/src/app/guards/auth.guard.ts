import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Chặn route cần đăng nhập (#1). Nếu chưa login -> chuyển về /login.
 */
export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // TODO: nếu auth.isLoggedIn() -> return true;
  //       ngược lại -> return router.parseUrl('/login');
  return true;
};
