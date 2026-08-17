import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { onboardingGuard } from './guards/onboarding.guard';
import { roleGuard } from './guards/role.guard';

/**
 * Sơ đồ route (lazy-load bằng loadComponent):
 *
 *  auth-layout (chưa đăng nhập)          app-layout (đã đăng nhập, authGuard)
 *  ├─ /login                             ├─ /dashboard        (mặc định sau login)
 *  ├─ /register                          ├─ /workspace        (list board)
 *  ├─ /forgot-password                   ├─ /board/:id        ⭐ màn Trello
 *  └─ /reset-password                    ├─ /members          (roleGuard: owner)
 *                                        └─ /settings
 *  Ngoài layout: /onboarding, /join/:token, ** (not-found)
 *
 * TODO(học viên): bật lại các guard khi service auth/tenant đã hoạt động.
 */
export const routes: Routes = [
  // Điều hướng mặc định — phải đứng TRƯỚC route "" bên dưới, nếu không route
  // "" (prefix match) sẽ luôn khớp trước và redirect không bao giờ chạy.
  { path: '', pathMatch: 'full', redirectTo: 'login' },

  // --- Nhóm xác thực (#1) ---
  {
    path: '',
    loadComponent: () => import('./layouts/auth-layout/auth-layout').then((m) => m.AuthLayout),
    children: [
      { path: 'login', loadComponent: () => import('./pages/login/login').then((m) => m.Login) },
      { path: 'register', loadComponent: () => import('./pages/register/register').then((m) => m.Register) },
      { path: 'forgot-password', loadComponent: () => import('./pages/forgot-password/forgot-password').then((m) => m.ForgotPassword) },
      { path: 'reset-password', loadComponent: () => import('./pages/reset-password/reset-password').then((m) => m.ResetPassword) },
    ],
  },



  // --- Phần app đã đăng nhập (#3, #4, #8, #9) ---
  {
    path: '',
    loadComponent: () => import('./layouts/app-layout/app-layout').then((m) => m.AppLayout),
    // canActivate: [authGuard, onboardingGuard], // TODO: bật khi sẵn sàng
    children: [
      { path: 'workspace', loadComponent: () => import('./pages/workspace/workspace').then((m) => m.Workspace) },
      { path: 'board/:id', loadComponent: () => import('./pages/board/board').then((m) => m.Board) },
      { path: 'settings', loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings) },
      { path: 'settings/manage-workspace', loadComponent: () => import('./pages/settings/manage-workspace/project-list/project-list').then((m) => m.ProjectList) },
      { path: 'settings/manage-workspace/:boardId', loadComponent: () => import('./pages/settings/manage-workspace/project-members/project-members').then((m) => m.ProjectMembers) },
    ],
  },

  // --- 404 ---
  { path: '**', loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFound) },
];
