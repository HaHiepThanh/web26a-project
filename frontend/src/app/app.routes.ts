import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { onboardingDoneGuard, onboardingGuard } from './guards/onboarding.guard';
import { roleGuard } from './guards/role.guard';
import { orgRedirectGuard, orgSlugGuard } from './guards/org-slug.guard';

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
 * TODO(học viên): bật lại các guard khi service auth/organization đã hoạt động.
 */
export const routes: Routes = [
  // Landing page công khai — trang chủ marketing, đứng TRƯỚC route "" (app-layout)
  // bên dưới vì đó là prefix match cho ':orgSlug' và sẽ nuốt luôn '' nếu đứng trước.
  { path: '', pathMatch: 'full', loadComponent: () => import('./pages/landing/landing').then((m) => m.Landing) },

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



  // --- Màn khởi động: bắt buộc tạo Organization trước khi vào app ---
  // Nằm NGOÀI app-layout vì lúc này user chưa có tổ chức nào, header/sidebar
  // (vốn hiển thị tổ chức + workspace) không có gì để render.
  {
    path: 'onboarding',
    canActivate: [onboardingDoneGuard],
    loadComponent: () => import('./pages/onboarding/onboarding').then((m) => m.Onboarding),
  },

  // --- Phần app đã đăng nhập (#3, #4, #8, #9) ---
  {
    path: '',
    loadComponent: () => import('./layouts/app-layout/app-layout').then((m) => m.AppLayout),
    canActivate: [onboardingGuard],
    children: [
      { path: 'settings', loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings) },
      { path: 'settings/manage-workspace', loadComponent: () => import('./pages/settings/manage-workspace/project-list/project-list').then((m) => m.ProjectList) },
      { path: 'settings/manage-workspace/:boardId', loadComponent: () => import('./pages/settings/manage-workspace/project-members/project-members').then((m) => m.ProjectMembers) },
      { path: 'not-found', loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFound) },

      // Link cũ chưa có slug (header, footer, sau khi đăng nhập) → chuyển sang
      // /:orgSlug/workspace của tổ chức đang chọn.
      { path: 'workspace', canActivate: [orgRedirectGuard], children: [] },
      { path: 'board/:id', canActivate: [orgRedirectGuard], children: [] },

      // ⚠️ PHẢI ĐỨNG CUỐI trong nhóm này: ':orgSlug' khớp mọi chuỗi 1 đoạn, nên
      // đặt trước 'settings' thì nó nuốt luôn /settings. Angular khớp từ trên
      // xuống, gặp route đầu tiên là dừng.
      // (Cùng lý do, mọi route gốc mới thêm phải nằm TRÊN đây VÀ được ghi vào
      //  RESERVED_SLUGS trong utils/slug.util.ts.)
      {
        path: ':orgSlug',
        canActivate: [orgSlugGuard],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'workspace' },
          { path: 'workspace', loadComponent: () => import('./pages/workspace/workspace').then((m) => m.Workspace) },
          { path: 'board/:id', loadComponent: () => import('./pages/board/board').then((m) => m.Board) },
        ],
      },
    ],
  },

  // --- 404 ---
  { path: '**', loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFound) },
];
