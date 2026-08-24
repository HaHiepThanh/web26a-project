/**
 * Slug của Organization — đứng ngay ở gốc URL: /thanh-organization/board/<uuid>
 *
 * Vì slug nằm ở gốc, nó DÙNG CHUNG namespace với mọi route của app. Nghĩa là
 * mỗi route gốc mới thêm sau này đều phải được bổ sung vào RESERVED_SLUGS bên
 * dưới, nếu không một tổ chức có thể chiếm mất đường dẫn của chính app.
 * (GitHub / Vercel / npm cũng làm y hệt cách này.)
 */

/**
 * ⚠️ THÊM ROUTE GỐC MỚI THÌ PHẢI THÊM VÀO ĐÂY.
 * Gồm: route đang có, file tĩnh Angular sinh ra, và vài từ để dành cho tương lai
 * (đặt trước còn hơn sau này kẹt — slug đã cấp thì không cho đổi).
 */
export const RESERVED_SLUGS: readonly string[] = [
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
];

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 30;

/** Khớp đúng CHECK constraint trong database.sql — sửa 1 bên thì phải sửa bên kia. */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Đổi tên tổ chức thành slug gợi ý. Xử lý được tiếng Việt có dấu:
 * "Tổ chức của Thanh" → "to-chuc-cua-thanh"
 */
export function slugify(input: string): string {
  return (
    input
      // Tách dấu thanh/dấu mũ ra khỏi chữ cái rồi xoá phần dấu.
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // 'đ' KHÔNG tách ra được bằng NFD (nét gạch không phải dấu tổ hợp),
      // nên phải thay tay.
      .replace(/[đĐ]/g, 'd')
      .toLowerCase()
      // Mọi ký tự còn lại không phải chữ/số đều thành gạch ngang.
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, SLUG_MAX_LENGTH)
      // Cắt theo độ dài có thể để lại gạch ngang lơ lửng ở cuối.
      .replace(/-+$/g, '')
  );
}

/** Returns an English error message, or null if the slug is valid. */
export function validateSlugFormat(slug: string): string | null {
  if (!slug) return 'Please enter a URL for the organization!';
  if (slug.length < SLUG_MIN_LENGTH) return `URL must be at least ${SLUG_MIN_LENGTH} characters!`;
  if (slug.length > SLUG_MAX_LENGTH) return `URL must be at most ${SLUG_MAX_LENGTH} characters!`;
  if (!SLUG_PATTERN.test(slug)) {
    return 'Only lowercase letters, numbers, and hyphens are allowed (cannot start or end with a hyphen).';
  }
  if (RESERVED_SLUGS.includes(slug)) return `"${slug}" is a reserved system URL, please choose another name!`;
  return null;
}
