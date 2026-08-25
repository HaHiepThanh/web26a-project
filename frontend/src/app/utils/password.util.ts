/**
 * Chính sách mật khẩu dùng CHUNG cho trang đăng ký và ô đổi mật khẩu trong
 * Settings.
 *
 * ⚠️ Đây là kiểm ở PHÍA TRÌNH DUYỆT. Mật khẩu đi thẳng từ trình duyệt lên
 *    Firebase Auth (xem `auth.service.registerWithEmail`) — backend của chúng ta
 *    không bao giờ nhìn thấy nó, nên không có chỗ nào để chặn ở tầng server.
 *    Ai gọi thẳng REST API của Firebase vẫn đặt được mật khẩu yếu; sàn cứng duy
 *    nhất là 6 ký tự do Firebase áp. Muốn chặn thật thì phải bật Password Policy
 *    trong Firebase Identity Platform. Ở đây là hướng dẫn người dùng tử tế, KHÔNG
 *    phải rào bảo mật.
 */

/** Sàn bắt buộc. Firebase chỉ đòi 6; 8 là mức nhích lên vừa phải, không gây khó. */
export const MIN_PASSWORD_LENGTH = 8;

/** Đủ dài để tính là "dài" khi chấm điểm — không bắt buộc. */
const GOOD_LENGTH = 12;

/**
 * Mật khẩu bị đoán ra ngay lập tức.
 *
 * Danh sách ngắn có chủ ý: đây không phải bộ lọc chống dò mật khẩu (việc đó cần
 * danh sách hàng triệu dòng, thuộc về server), chỉ để chặn những chuỗi mà người
 * dùng gõ ra vì lười — và chặn ngay lúc họ đang chọn, kèm lý do.
 */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'passw0rd', '12345678', '123456789',
  '1234567890', 'qwerty', 'qwerty123', 'qwertyuiop', 'abc12345', 'iloveyou',
  '11111111', '00000000', 'letmein', 'welcome', 'admin123', 'trello123',
  'matkhau', 'matkhau123', '1q2w3e4r', 'zaq12wsx', 'football', 'monkey',
  'dragon', 'sunshine', 'princess', 'baseball',
]);

/** Một điều kiện bắt buộc, hiện thành dòng có dấu tick trên giao diện. */
export interface PasswordRule {
  id: 'length' | 'case' | 'digit' | 'notObvious';
  label: string;
  ok: boolean;
}

export interface PasswordCheck {
  rules: PasswordRule[];
  /** Đủ MỌI điều kiện bắt buộc — nơi gọi dựa vào đây để cho/chặn gửi form. */
  meetsPolicy: boolean;
  /** 0–5. Có tính cả phần thưởng cho độ dài và ký tự đặc biệt. */
  score: number;
  label: string;
  /** Bề rộng thanh, tính sẵn theo phần trăm. */
  percent: number;
  colorVar: string;
}

const LEVELS = [
  { label: 'Very weak', colorVar: '#ef4444' },
  { label: 'Very weak', colorVar: '#ef4444' },
  { label: 'Weak', colorVar: '#f97316' },
  { label: 'Fair', colorVar: '#eab308' },
  { label: 'Strong', colorVar: '#22c55e' },
  { label: 'Very strong', colorVar: '#10b981' },
];

/** Các mẩu định danh của chính người dùng — mật khẩu chứa chúng là đoán được ngay. */
function ownWords(context: { email?: string; username?: string; displayName?: string }): string[] {
  const raw = [
    context.email?.split('@')[0],
    context.username,
    ...(context.displayName?.split(/\s+/) ?? []),
  ];
  // Bỏ mẩu quá ngắn: tên "Lê" mà cấm thì mọi mật khẩu có chữ "le" đều trượt.
  return raw.filter((w): w is string => !!w && w.length >= 3).map((w) => w.toLowerCase());
}

/**
 * Chấm một mật khẩu: vừa trả về danh sách điều kiện bắt buộc (đạt/chưa), vừa trả
 * về điểm mạnh để vẽ thanh.
 *
 * Cố ý TÁCH hai thứ đó. Chặn gửi form theo `meetsPolicy` — một danh sách rõ ràng
 * người dùng biết còn thiếu gì — chứ không chặn theo điểm: "mật khẩu chưa đủ
 * mạnh" mà không nói thiếu gì là kiểu thông báo khiến người ta gõ bừa cho qua.
 */
export function checkPassword(
  password: string,
  context: { email?: string; username?: string; displayName?: string } = {},
): PasswordCheck {
  const pw = password ?? '';
  const lower = pw.toLowerCase();

  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);

  const chuaTen = ownWords(context).some((w) => lower.includes(w));
  const phoBien = COMMON_PASSWORDS.has(lower);

  const rules: PasswordRule[] = [
    { id: 'length', label: `At least ${MIN_PASSWORD_LENGTH} characters`, ok: pw.length >= MIN_PASSWORD_LENGTH },
    { id: 'case', label: 'Both upper and lower case letters', ok: hasLower && hasUpper },
    { id: 'digit', label: 'At least one number', ok: hasDigit },
    {
      id: 'notObvious',
      label: 'Not a common password, and not your name or email',
      // Chuỗi rỗng chưa phải "hiển nhiên" — để nó đạt thì ô trống lại hiện tick
      // xanh, trông như đã xong một phần trong khi người dùng chưa gõ gì.
      ok: pw.length > 0 && !phoBien && !chuaTen,
    },
  ];

  const meetsPolicy = rules.every((r) => r.ok);

  let score = 0;
  if (pw.length >= MIN_PASSWORD_LENGTH) score++;
  if (pw.length >= GOOD_LENGTH) score++;
  if (hasLower && hasUpper) score++;
  if (hasDigit) score++;
  if (hasSymbol) score++;

  // Chưa qua chính sách thì trần là "Weak" — thanh xanh lá trên một mật khẩu bị
  // từ chối là hai tín hiệu đá nhau.
  if (!meetsPolicy) score = Math.min(score, 2);
  if (!pw) score = 0;

  const level = LEVELS[Math.min(score, LEVELS.length - 1)];
  return { rules, meetsPolicy, score, label: pw ? level.label : '', percent: (score / 5) * 100, colorVar: level.colorVar };
}
