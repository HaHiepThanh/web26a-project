/**
 * Slug của tổ chức nằm ngay ở GỐC url (`/thanh-organization/...`) nên nó dùng
 * chung namespace với mọi route của app. Một tổ chức đặt slug `settings` là
 * chiếm mất trang `/settings` — và slug đã cấp thì KHÔNG cho đổi.
 *
 * ⚠️ Danh sách này phải khớp với `RESERVED_SLUGS` trong
 *    frontend/src/app/utils/slug.util.ts và ghi chú trong database.sql mục 3.
 *    Thêm route gốc mới thì phải thêm vào CẢ HAI nơi.
 *
 * Dùng Set thay vì mảng: kiểm tra `.has()` là O(1) và ý nghĩa rõ hơn `.includes()`.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // Route đang có trong app.routes.ts
  'login', 'register', 'forgot-password', 'reset-password',
  'workspace', 'board', 'settings', 'dashboard', 'members', 'onboarding',
  'not-found', '404',
  // File/thư mục tĩnh do Angular build sinh ra ở gốc
  'assets', 'static', 'public', 'favicon.ico', 'index.html',
  // Hạ tầng
  'api', 'admin', 'auth', 'app', 'www', 'mail', 'cdn',
  // Để dành cho tương lai
  'join', 'invite', 'new', 'help', 'about', 'terms', 'privacy', 'pricing',
  'blog', 'docs', 'support', 'status', 'search', 'notifications',
  'me', 'user', 'users', 'profile', 'org', 'orgs', 'o',
]);

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 30;
