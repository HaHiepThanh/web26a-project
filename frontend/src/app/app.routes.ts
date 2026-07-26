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

  // --- Onboarding + nhận invite (đứng riêng, không trong app-layout) ---
  { path: 'onboarding', loadComponent: () => import('./pages/onboarding/onboarding').then((m) => m.Onboarding) /* , canActivate: [authGuard] */ },
  { path: 'join/:token', loadComponent: () => import('./pages/join/join').then((m) => m.Join) },

  // --- Phần app đã đăng nhập (#3, #4, #8, #9) ---
  {
    path: '',
    loadComponent: () => import('./layouts/app-layout/app-layout').then((m) => m.AppLayout),
    // canActivate: [authGuard, onboardingGuard], // TODO: bật khi sẵn sàng
    children: [
      { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard) },
      { path: 'workspace', loadComponent: () => import('./pages/workspace/workspace').then((m) => m.Workspace) },
      { path: 'board/:id', loadComponent: () => import('./pages/board/board').then((m) => m.Board) },
      { path: 'members', loadComponent: () => import('./pages/members/members').then((m) => m.Members) /* , canActivate: [roleGuard] */ },
      { path: 'settings', loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings) },
    ],
  },

  // --- Điều hướng mặc định + 404 ---
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFound) },
];
