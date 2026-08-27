#!/usr/bin/env node
/**
 * Người ngoài có "khơi khơi" vào được tổ chức không?
 *
 * CÁCH CHẠY:
 *     cd backend
 *     npm run start:dev                            # cửa sổ 1
 *     node scripts/kiem-tra-chong-xam-nhap.mjs     # cửa sổ 2
 *
 * Bộ này KHÁC kiem-tra-bao-mat.mjs. Bộ kia hỏi "người ngoài ĐỌC được gì
 * không". Bộ này hỏi câu nặng hơn: "người ngoài TỰ VÀO được không" — tức là
 * tự biến mình thành thành viên, sau đó mọi quyền đọc/ghi đều hợp lệ.
 *
 * Cách nghĩ khi viết: liệt kê MỌI đường một người có thể trở thành thành viên,
 * rồi thử đi ngược từng đường đó mà không có sự đồng ý của tổ chức:
 *
 *   1. Tự mời mình
 *   2. Nhận lời mời gửi cho NGƯỜI KHÁC (chỉ cần biết id lời mời)
 *   3. Đoán / sửa / mượn token của link mời
 *   4. Ghi thẳng qua endpoint quản lý thành viên
 *   5. Đã vào rồi thì tự nâng quyền
 *   6. Bị đá ra rồi có mất quyền thật không
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Đường dẫn tới file biến môi trường DUY NHẤT của dự án: `secrets/.env`.
 *
 * Vẫn thử `backend/.env` sau đó, để máy nào chưa gộp env vẫn chạy được script.
 */
function duongDanEnv() {
  const uuTien = [join(ROOT, '..', 'secrets', '.env'), join(ROOT, '.env')];
  return uuTien.find((p) => existsSync(p)) ?? uuTien[0];
}

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', DIM = '\x1b[2m', RS = '\x1b[0m';

const pass = [], fail = [];
function check(code, desc, ok, why = '') {
  (ok ? pass : fail).push({ code, desc, why });
  console.log(`  ${ok ? G + '✔' + RS : R + '✘' + RS} ${code.padEnd(6)} ${desc}`);
  if (!ok && why) console.log(`      ${R}→ ${why}${RS}`);
}
const section = (t) => console.log(`\n${Y}── ${t} ${'─'.repeat(Math.max(0, 56 - t.length))}${RS}`);

function readEnv(name) {
  for (const line of readFileSync(duongDanEnv(), 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const [k, ...rest] = t.split('=');
    if (k.trim() === name) return rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
  return null;
}
function readApiKey() {
  const d = join(ROOT, 'postman');
  for (const f of readdirSync(d).sort()) {
    if (!f.endsWith('.postman_environment.json')) continue;
    const hit = JSON.parse(readFileSync(join(d, f), 'utf8')).values.find((v) => v.key === 'firebaseApiKey' && v.value);
    if (hit) return hit.value;
  }
  return null;
}
const API_KEY = readApiKey();
const SB_URL = readEnv('SUPABASE_URL'), SB_KEY = readEnv('SUPABASE_SERVICE_ROLE_KEY');

async function firebase(op, email, password = 'Passw0rd!') {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${op}?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  return r.json();
}
async function api(method, path, token, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return [r.status, parsed];
}
async function sb(method, path, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const t = await r.text();
  return [r.status, t ? JSON.parse(t) : null];
}

/** Câu hỏi duy nhất đáng tin: uid này CÓ trong organization_members không? */
async function laThanhVien(orgId, uid) {
  const [, rows] = await sb('GET', `organization_members?org_id=eq.${orgId}&user_id=eq.${uid}&select=role`);
  return Array.isArray(rows) && rows.length > 0;
}

console.log(`\n${Y}CHỐNG XÂM NHẬP TỔ CHỨC — người ngoài có tự vào được không?${RS}`);
console.log(`${DIM}${BASE}${RS}\n`);

if (!API_KEY || (await api('GET', '/health'))[0] !== 200) {
  console.log(`${R}Thiếu firebaseApiKey hoặc backend chưa chạy.${RS}\n`);
  process.exit(1);
}

const EMAILS = ['hocvien-a@test.dev', 'kiemtra-b@test.dev', 'kiemtra-c@test.dev', 'kiemtra-d@test.dev'];
for (const e of EMAILS) await firebase('signUp', e);
const [ra, rb, rc, rd] = await Promise.all(EMAILS.map((e) => firebase('signInWithPassword', e)));
const A = ra.idToken, B = rb.idToken, C = rc.idToken, D = rd.idToken;
const A_UID = ra.localId, B_UID = rb.localId, C_UID = rc.localId, D_UID = rd.localId;
for (const t of [A, B, C, D]) await api('GET', '/auth/me', t);

const STAMP = Date.now();
// Hai tổ chức: A làm chủ tổ chức MỤC TIÊU, C làm chủ một tổ chức khác.
const [, orgA] = await api('POST', '/organizations', A, { name: 'Muc tieu', slug: `xn-muctieu-${STAMP}` });
const [, orgC] = await api('POST', '/organizations', C, { name: 'To chuc khac', slug: `xn-khac-${STAMP}` });
const OID = orgA.id, OID_KHAC = orgC.id;
console.log(`${G}✔${RS} A làm chủ tổ chức MỤC TIÊU · C làm chủ một tổ chức KHÁC`);
console.log(`${G}✔${RS} D là kẻ lạ: không thuộc tổ chức nào của A\n`);

async function cleanup() {
  for (const o of [OID, OID_KHAC]) {
    await sb('DELETE', `organization_invite_links?org_id=eq.${o}`);
    await sb('DELETE', `organization_invites?org_id=eq.${o}`);
    await sb('DELETE', `organizations?id=eq.${o}`);
  }
}

try {
  // ═══════════════════════════════════ 1. KHÔNG CÓ LỜI MỜI
  section('1. D KHÔNG CÓ LỜI MỜI NÀO');

  {
    const [s] = await api('POST', `/organizations/${OID}/invites`, D, { toUserId: D_UID, role: 'member' });
    check('1.1', 'D tự gửi lời mời cho chính mình → chặn', s === 403 || s === 404, `nhận ${s}`);
    check('1.2', '  … và D vẫn KHÔNG phải thành viên', !(await laThanhVien(OID, D_UID)), 'ĐÃ LỌT VÀO');
  }
  {
    const [s] = await api('PATCH', `/organizations/${OID}/members/${D_UID}/role`, D, { role: 'admin' });
    check('1.3', 'D tự đặt vai trò cho mình trong tổ chức → chặn', s === 403 || s === 404, `nhận ${s}`);
    check('1.4', '  … và D vẫn KHÔNG phải thành viên', !(await laThanhVien(OID, D_UID)), 'ĐÃ LỌT VÀO');
  }
  {
    const [s] = await api('PATCH', `/organizations/${OID}`, D, { name: 'Cua toi roi' });
    check('1.5', 'D đổi tên tổ chức → chặn', s === 403 || s === 404, `nhận ${s}`);
  }
  {
    const [s] = await api('POST', `/organizations/${OID}/invite-links`, D, { expiresInDays: 7 });
    check('1.6', 'D tự tạo link mời cho tổ chức của A → chặn', s === 403 || s === 404, `nhận ${s}`);
  }
  {
    const [s] = await api('GET', `/organizations/${OID}/invite-links`, D);
    check('1.7', 'D đọc trộm danh sách link (để lấy token) → chặn', s === 403 || s === 404, `nhận ${s}`);
  }

  // ═══════════════════════════════════ 2. LỜI MỜI CỦA NGƯỜI KHÁC
  section('2. D CƯỚP LỜI MỜI GỬI CHO NGƯỜI KHÁC');

  {
    // A mời B đàng hoàng. D bằng cách nào đó biết được id của lời mời này.
    const [, inv] = await api('POST', `/organizations/${OID}/invites`, A, { toUserId: B_UID, role: 'member' });

    const [s] = await api('PATCH', `/organizations/invites/${inv.id}`, D, { accept: true });
    check('2.1', 'D nhận lời mời gửi cho B → chặn', s === 403 || s === 404, `nhận ${s}`);
    check('2.2', '  … và D vẫn KHÔNG phải thành viên', !(await laThanhVien(OID, D_UID)), 'ĐÃ LỌT VÀO');

    const [sHuy] = await api('DELETE', `/organizations/invites/${inv.id}`, D);
    check('2.3', 'D huỷ lời mời của người khác → chặn', sHuy === 403 || sHuy === 404, `nhận ${sHuy}`);

    // B nhận đúng lời mời của mình thì phải được.
    const [sB] = await api('PATCH', `/organizations/invites/${inv.id}`, B, { accept: true });
    check('2.4', 'B nhận đúng lời mời của mình → vào được', sB === 200 || sB === 201, `nhận ${sB}`);
  }

  // ═══════════════════════════════════ 3. TẤN CÔNG TOKEN LINK MỜI
  section('3. D TẤN CÔNG TOKEN CỦA LINK MỜI');

  let TOKEN_A = null;
  {
    const [, link] = await api('POST', `/organizations/${OID}/invite-links`, A, { expiresInDays: 7 });
    TOKEN_A = link.token;
  }
  {
    const [s] = await api('POST', '/invite-links/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/accept', D, undefined);
    check('3.1', 'D đoán bừa một token 43 ký tự → 404', s === 404, `nhận ${s}`);
    check('3.2', '  … và D vẫn KHÔNG phải thành viên', !(await laThanhVien(OID, D_UID)), 'ĐÃ LỌT VÀO');
  }
  {
    // Đổi 1 ký tự trong token thật — thử xem có so sánh lỏng lẻo kiểu prefix không.
    const sua = (TOKEN_A[0] === 'a' ? 'b' : 'a') + TOKEN_A.slice(1);
    const [s] = await api('POST', `/invite-links/${sua}/accept`, D, undefined);
    check('3.3', 'D sửa 1 ký tự của token thật → 404', s === 404, `nhận ${s}`);
  }
  {
    // Cắt ngắn token — nếu backend so sánh kiểu "bắt đầu bằng" thì lọt.
    const [s] = await api('POST', `/invite-links/${TOKEN_A.slice(0, 20)}/accept`, D, undefined);
    check('3.4', 'D cắt ngắn token thật → 404', s === 404, `nhận ${s}`);
  }
  {
    // Token có phân biệt hoa thường không? base64url có cả hai.
    const daoHoaThuong = TOKEN_A.split('').map((c) =>
      c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()).join('');
    const [s] = await api('POST', `/invite-links/${daoHoaThuong}/accept`, D, undefined);
    check('3.5', 'D đảo hoa/thường của token → 404 (token phân biệt hoa thường)',
      s === 404, `nhận ${s} — nếu 200 thì không gian token bị thu nhỏ hàng tỉ lần`);
  }
  {
    // Link của tổ chức KHÁC có mở được tổ chức này không?
    const [, linkKhac] = await api('POST', `/organizations/${OID_KHAC}/invite-links`, C, { expiresInDays: 7 });
    const [s, d] = await api('POST', `/invite-links/${linkKhac.token}/accept`, D, undefined);
    check('3.6', 'Link của tổ chức KHÁC chỉ mở đúng tổ chức đó',
      s === 200 && d?.orgId === OID_KHAC, `nhận ${s}, orgId=${d?.orgId}`);
    check('3.7', '  … và KHÔNG cho D vào tổ chức mục tiêu',
      !(await laThanhVien(OID, D_UID)), 'ĐÃ LỌT VÀO TỔ CHỨC MỤC TIÊU');
  }
  {
    // SQL/PostgREST injection qua token trên URL.
    const doc = encodeURIComponent("' or 1=1--");
    const [s] = await api('POST', `/invite-links/${doc}/accept`, D, undefined);
    check('3.8', "Token kiểu \"' or 1=1--\" → 404, không phải 500", s === 404, `nhận ${s}`);
  }
  {
    const [, links] = await api('GET', `/organizations/${OID}/invite-links`, B);
    check('3.9', 'B (member thường, đã ở trong tổ chức) đọc token → chặn',
      !Array.isArray(links), `đọc được ${Array.isArray(links) ? links.length + ' link' : 'không'}`);
  }

  // ═══════════════════════════════════ 4. VÀO RỒI THÌ LEO THANG?
  section('4. B ĐÃ VÀO (member) — LEO THANG ĐƯỢC KHÔNG?');

  {
    const [s] = await api('PATCH', `/organizations/${OID}/members/${B_UID}/role`, B, { role: 'admin' });
    const [, rows] = await sb('GET', `organization_members?org_id=eq.${OID}&user_id=eq.${B_UID}&select=role`);
    check('4.1', 'B tự nâng mình lên admin → chặn', s === 403 || s === 404, `nhận ${s}`);
    check('4.2', '  … và vai trò vẫn là member', rows?.[0]?.role === 'member', `vai trò=${rows?.[0]?.role}`);
  }
  {
    const [s] = await api('PATCH', `/organizations/${OID}/members/${A_UID}/role`, B, { role: 'member' });
    check('4.3', 'B hạ cấp chủ tổ chức → chặn', s === 403 || s === 404, `nhận ${s}`);
  }
  {
    const [s] = await api('DELETE', `/organizations/${OID}/members/${A_UID}`, B);
    check('4.4', 'B đá chủ tổ chức ra → chặn', s === 403 || s === 404, `nhận ${s}`);
    check('4.5', '  … và A vẫn còn trong tổ chức', await laThanhVien(OID, A_UID), 'CHỦ TỔ CHỨC ĐÃ BỊ ĐÁ');
  }

  // ═══════════════════════════════════ 5. BỊ ĐÁ RA THÌ MẤT QUYỀN NGAY
  section('5. BỊ ĐÁ RA KHỎI TỔ CHỨC');

  {
    const [, ws] = await api('POST', '/workspaces', A, { orgId: OID, name: 'Noi bo' });
    const [, brd] = await api('POST', '/boards', A, { workspaceId: ws.id, name: 'Board noi bo' });

    const [sTruoc] = await api('GET', `/boards/${brd.id}`, B);
    check('5.1', 'Trước khi bị đá: B vào được board', sTruoc === 200, `nhận ${sTruoc}`);

    await api('DELETE', `/organizations/${OID}/members/${B_UID}`, A);

    const [sSau] = await api('GET', `/boards/${brd.id}`, B);
    check('5.2', 'Sau khi bị đá: B mất quyền NGAY (token cũ vẫn còn hạn)',
      sSau === 403 || sSau === 404, `nhận ${sSau} — token Firebase chưa hết hạn mà vẫn phải chặn`);

    const [, list] = await api('GET', '/organizations', B);
    check('5.3', 'Tổ chức biến khỏi danh sách của B',
      !(Array.isArray(list) && list.some((o) => o.id === OID)), 'vẫn còn trong danh sách');
  }

  // ═══════════════════════════════════ 6. LINK CŨ SAU KHI BỊ ĐÁ
  section('6. B BỊ ĐÁ RỒI CÒN LINK CŨ TRONG TAY');

  {
    // Đây là tình huống thật: người bị mời ra khỏi tổ chức vẫn giữ link cũ
    // trong lịch sử chat. Link còn hạn thì họ vào lại được — ĐÚNG theo thiết
    // kế (link là lời mời mở), nên chủ tổ chức phải THU HỒI link mới chặn nổi.
    const [sVaoLai] = await api('POST', `/invite-links/${TOKEN_A}/accept`, B, undefined);
    check('6.1', 'Link CÒN HẠN: B dùng lại vào được (đúng thiết kế của link mở)',
      sVaoLai === 200, `nhận ${sVaoLai}`);

    await api('DELETE', `/organizations/${OID}/members/${B_UID}`, A);

    const [, links] = await api('GET', `/organizations/${OID}/invite-links`, A);
    const link = (links ?? []).find((l) => l.token === TOKEN_A);
    await api('DELETE', `/invite-links/${link.id}`, A);

    const [sSauThuHoi] = await api('POST', `/invite-links/${TOKEN_A}/accept`, B, undefined);
    check('6.2', 'Sau khi THU HỒI link: B không vào lại được nữa', sSauThuHoi === 410, `nhận ${sSauThuHoi}`);
    check('6.3', '  … và B không phải thành viên', !(await laThanhVien(OID, B_UID)), 'ĐÃ LỌT VÀO');
  }
} catch (e) {
  console.log(`\n${R}Lỗi khi chạy: ${e.stack ?? e}${RS}`);
} finally {
  await cleanup();
}

console.log(`\n${Y}${'═'.repeat(62)}${RS}`);
if (fail.length === 0) {
  console.log(`${G}KẾT QUẢ: ${pass.length}/${pass.length} ĐẠT — không có đường nào tự vào tổ chức.${RS}\n`);
} else {
  console.log(`${R}KẾT QUẢ: ${pass.length}/${pass.length + fail.length} đạt, ${fail.length} THỦNG:${RS}`);
  for (const f of fail) console.log(`  ${R}✘${RS} ${f.code} ${f.desc}${f.why ? ` ${DIM}(${f.why})${RS}` : ''}`);
  console.log();
  process.exit(1);
}
