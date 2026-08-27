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
 *  Ngoài layout: / (landing), /onboarding, /join/:token, ** (not-found)
 *
 * TODO(học viên): bật lại các guard khi service auth/organization đã hoạt động.
 */
export const routes: Routes = [
  // --- Trang giới thiệu ---
  //
  // Trước đây chỗ này là `redirectTo: 'login'`. Thay bằng chính trang landing là
  // cách ít đụng chạm nhất: KHÔNG có route nào khác phải sửa, KHÔNG có guard nào
  // bị bỏ qua. Lý do nó an toàn nằm ở `pathMatch: 'full'` — route này chỉ khớp
  // đúng đường dẫn rỗng, nên `/login`, `/onboarding`, `/:orgSlug/workspace`…
  // vẫn đi tiếp xuống các nhóm bên dưới y như cũ.
  //
  // Phải đứng TRƯỚC hai route "" bên dưới: hai route đó khớp theo tiền tố nên
  // nếu đặt sau, chúng nuốt luôn đường dẫn rỗng và trang này không bao giờ chạy.
  //
  // Cố ý KHÔNG gắn guard: đây là trang công khai, người chưa đăng nhập phải xem
  // được. Người đã đăng nhập vào `/` cũng không bị đá đi đâu — thanh điều hướng
  // của trang tự đổi nút thành "Vào không gian làm việc" khi thấy đã có phiên.
  //
  // Cũng KHÔNG nằm trong layout nào: landing có thanh điều hướng và chân trang
  // riêng kiểu trang giới thiệu, không dùng header/sidebar của app.
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/landing/landing').then((m) => m.Landing),
  },

  // --- Nhóm xác thực (#1) ---
  {
    path: '',
    loadComponent: () => import('./layouts/auth-layout/auth-layout').then((m) => m.AuthLayout),
    children: [
      { path: 'login', loadComponent: () => import('./pages/login/login').then((m) => m.Login) },
      { path: 'register', loadComponent: () => import('./pages/register/register').then((m) => m.Register) },
      { path: 'forgot-password', loadComponent: () => import('./pages/forgot-password/forgot-password').then((m) => m.ForgotPassword) },
      { path: 'reset-password', loadComponent: () => import('./pages/reset-password/reset-password').then((m) => m.ResetPassword) },
      { path: 'auth/action', loadComponent: () => import('./pages/reset-password/reset-password').then((m) => m.ResetPassword) },
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

  // --- Link mời vào tổ chức ---
  // Cũng nằm NGOÀI app-layout, cùng lý do với /onboarding: người bấm link có
  // thể chưa thuộc tổ chức nào, mà onboardingGuard của layout app sẽ đá họ sang
  // /onboarding trước khi trang kịp chạy — đúng lúc họ đang cầm lời mời.
  // Trang tự lo phần chưa đăng nhập (chuyển sang /login kèm returnUrl).
  {
    path: 'join/:token',
    loadComponent: () => import('./pages/join/join').then((m) => m.Join),
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
