#!/usr/bin/env node
/**
 * Kiểm tra link mời vào tổ chức có thời hạn.
 *
 * CÁCH CHẠY:
 *     cd backend
 *     npm run start:dev                        # cửa sổ 1
 *     node scripts/kiem-tra-link-moi.mjs       # cửa sổ 2
 *
 * ⚠️ Cần chạy migrations/0005_link_moi_co_thoi_han.sql trước.
 *
 * Điều quan trọng nhất phải chứng minh: link HẾT HẠN thì KHÔNG dùng được nữa.
 * Không chờ 7 ngày — dùng service_role đẩy `expires_at` về quá khứ rồi thử lại.
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
/** Ghi thẳng vào DB bằng service_role — chỉ để DỰNG tình huống, không phải để kiểm. */
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

console.log(`\n${Y}KIỂM TRA LINK MỜI CÓ THỜI HẠN${RS}`);
console.log(`${DIM}${BASE}${RS}\n`);

if (!API_KEY || (await api('GET', '/health'))[0] !== 200) {
  console.log(`${R}Thiếu firebaseApiKey hoặc backend chưa chạy.${RS}\n`);
  process.exit(1);
}

// Migration đã chạy chưa? Chưa thì mọi phép thử dưới đều vô nghĩa.
{
  const r = await fetch(`${SB_URL}/rest/v1/organization_invite_links?select=id&limit=1`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) {
    console.log(`${R}Chưa chạy migrations/0005_link_moi_co_thoi_han.sql.${RS}`);
    console.log(`${DIM}Mở Supabase → SQL Editor → dán file đó → Run, rồi chạy lại.${RS}\n`);
    process.exit(1);
  }
}
console.log(`${G}✔${RS} Migration 0005 đã áp dụng`);

const EMAILS = ['hocvien-a@test.dev', 'kiemtra-b@test.dev', 'kiemtra-c@test.dev', 'kiemtra-d@test.dev'];
for (const e of EMAILS) await firebase('signUp', e);
const [ra, rb, rc, rd] = await Promise.all(EMAILS.map((e) => firebase('signInWithPassword', e)));
const A = ra.idToken, B = rb.idToken, C = rc.idToken, D = rd.idToken;
const B_UID = rb.localId;
for (const t of [A, B, C, D]) await api('GET', '/auth/me', t);
console.log(`${G}✔${RS} A (chủ) · B, C, D (chưa vào tổ chức)`);

const STAMP = Date.now();
const [, org] = await api('POST', '/organizations', A, { name: 'KT Link', slug: `kt-link-${STAMP}` });
const OID = org.id;

async function cleanup() {
  await sb('DELETE', `organization_invite_links?org_id=eq.${OID}`);
  await sb('DELETE', `organizations?id=eq.${OID}`);
}

try {
  // ═════════════════════════════════════════════ 1. TẠO LINK
  section('1. TẠO LINK');

  let TOKEN = null;
  {
    const [s, d] = await api('POST', `/organizations/${OID}/invite-links`, A, { expiresInDays: 7, role: 'member' });
    TOKEN = d?.token;
    check('1.1', 'Chủ tổ chức tạo được link', s === 201 && !!d?.token, `nhận ${s}`);
    check('1.2', 'Token đủ dài để không đoán được (≥ 40 ký tự)',
      (d?.token?.length ?? 0) >= 40, `dài ${d?.token?.length}`);
    check('1.3', 'Có hạn dùng trong tương lai',
      !!d?.expiresAt && new Date(d.expiresAt) > new Date(), `expiresAt=${d?.expiresAt}`);
    check('1.4', 'Link mới tạo đang hoạt động', d?.active === true, `active=${d?.active}`);
  }
  {
    const [s] = await api('POST', `/organizations/${OID}/invite-links`, D, { expiresInDays: 7 });
    check('1.5', 'Người NGOÀI tổ chức tạo link → bị từ chối', s === 403 || s === 404, `nhận ${s}`);
  }
  {
    const [s] = await api('POST', `/organizations/${OID}/invite-links`, A, { expiresInDays: 999 });
    check('1.6', 'Hạn quá 30 ngày → bị từ chối', s === 400, `nhận ${s}`);
  }
  {
    const [s] = await api('POST', `/organizations/${OID}/invite-links`, A, { role: 'owner' });
    check('1.7', "Mời làm 'owner' → bị từ chối", s === 400, `nhận ${s}`);
  }

  // ═════════════════════════════════════════════ 2. DÙNG LINK
  section('2. DÙNG LINK');

  {
    const [s, d] = await api('GET', `/invite-links/${TOKEN}/preview`, B);
    check('2.1', 'B xem trước → thấy tên tổ chức', s === 200 && !!d?.orgName, `nhận ${s}`);
    check('2.2', 'B chưa là thành viên → alreadyMember = false', d?.alreadyMember === false, `${d?.alreadyMember}`);
  }
  {
    const [s, d] = await api('POST', `/invite-links/${TOKEN}/accept`, B, undefined);
    check('2.3', 'B dùng link → vào được tổ chức', s === 200 && d?.orgId === OID, `nhận ${s}`);
  }
  {
    const [, list] = await api('GET', '/organizations', B);
    check('2.4', 'Tổ chức đã hiện trong danh sách của B',
      Array.isArray(list) && list.some((o) => o.id === OID), 'không thấy');
  }
  {
    const [s] = await api('POST', `/invite-links/${TOKEN}/accept`, B, undefined);
    check('2.5', 'B bấm lại lần nữa → vẫn 200, không lỗi', s === 200, `nhận ${s}`);
  }
  {
    const [, d] = await api('GET', `/organizations/${OID}/invite-links`, A);
    const link = (d ?? []).find((l) => l.token === TOKEN);
    check('2.6', 'Bấm lại KHÔNG tiêu thêm lượt (usedCount vẫn 1)',
      link?.usedCount === 1, `usedCount=${link?.usedCount}`);
  }
  {
    const [s] = await api('GET', `/invite-links/${TOKEN}/preview`, null);
    check('2.7', 'Chưa đăng nhập mà xem trước → bị từ chối', s === 401 || s === 403, `nhận ${s}`);
  }
  {
    const [s] = await api('POST', '/invite-links/khong-co-that-dau/accept', C, undefined);
    check('2.8', 'Token bịa → 404', s === 404, `nhận ${s}`);
  }

  // ═════════════════════════════════════════════ 3. HẾT HẠN
  section('3. HẾT HẠN THÌ NGỪNG HOẠT ĐỘNG');

  {
    const [, d] = await api('POST', `/organizations/${OID}/invite-links`, A, { expiresInDays: 1 });
    const t = d.token;
    // Đẩy hạn về quá khứ thay vì chờ 1 ngày.
    await sb('PATCH', `organization_invite_links?token=eq.${encodeURIComponent(t)}`,
      { expires_at: new Date(Date.now() - 60_000).toISOString() });

    const [sPreview] = await api('GET', `/invite-links/${t}/preview`, C);
    check('3.1', 'Link hết hạn: xem trước → 410 Gone', sPreview === 410, `nhận ${sPreview}`);

    const [sAccept] = await api('POST', `/invite-links/${t}/accept`, C, undefined);
    check('3.2', 'Link hết hạn: dùng → 410 Gone', sAccept === 410, `nhận ${sAccept}`);

    const [, list] = await api('GET', '/organizations', C);
    check('3.3', 'C KHÔNG lọt vào tổ chức bằng link hết hạn',
      !(Array.isArray(list) && list.some((o) => o.id === OID)), 'C đã lọt vào — THỦNG');

    const [, links] = await api('GET', `/organizations/${OID}/invite-links`, A);
    const hetHan = (links ?? []).find((l) => l.token === t);
    check('3.4', 'Link hết hạn hiện active = false', hetHan?.active === false, `active=${hetHan?.active}`);
  }

  // ═════════════════════════════════════════════ 4. THU HỒI
  section('4. THU HỒI TRƯỚC HẠN');

  {
    const [, d] = await api('POST', `/organizations/${OID}/invite-links`, A, { expiresInDays: 7 });
    const [sRevoke] = await api('DELETE', `/invite-links/${d.id}`, A);
    check('4.1', 'Chủ tổ chức thu hồi được link', sRevoke === 200, `nhận ${sRevoke}`);

    const [sAccept] = await api('POST', `/invite-links/${d.token}/accept`, C, undefined);
    check('4.2', 'Link đã thu hồi: dùng → 410 Gone', sAccept === 410, `nhận ${sAccept}`);
  }
  {
    const [, d] = await api('POST', `/organizations/${OID}/invite-links`, A, { expiresInDays: 7 });
    const [s] = await api('DELETE', `/invite-links/${d.id}`, D);
    check('4.3', 'Người ngoài thu hồi link → bị từ chối', s === 403 || s === 404, `nhận ${s}`);
  }

  // ═════════════════════════════════════════════ 5. GIỚI HẠN LƯỢT
  section('5. GIỚI HẠN SỐ LƯỢT');

  {
    const [, d] = await api('POST', `/organizations/${OID}/invite-links`, A, { expiresInDays: 7, maxUses: 1 });
    const [s1] = await api('POST', `/invite-links/${d.token}/accept`, C, undefined);
    check('5.1', 'Lượt đầu (C) dùng được', s1 === 200, `nhận ${s1}`);

    const [s2] = await api('POST', `/invite-links/${d.token}/accept`, D, undefined);
    check('5.2', 'Hết lượt: người thứ hai (D) → 410 Gone', s2 === 410, `nhận ${s2}`);

    const [, list] = await api('GET', '/organizations', D);
    check('5.3', 'D KHÔNG lọt vào tổ chức',
      !(Array.isArray(list) && list.some((o) => o.id === OID)), 'D đã lọt vào — THỦNG');
  }

  // ═════════════════════════════════════════════ 6. TOKEN LÀ BÍ MẬT
  section('6. TOKEN KHÔNG ĐƯỢC LỘ CHO THÀNH VIÊN THƯỜNG');

  {
    // B đang là 'member' thường trong tổ chức.
    const [s] = await api('GET', `/organizations/${OID}/invite-links`, B);
    check('6.1', 'Thành viên thường xem danh sách link → bị từ chối (token là bí mật)',
      s === 403 || s === 404, `nhận ${s}`);
  }
  {
    const [s] = await api('POST', `/organizations/${OID}/invite-links`, B, { expiresInDays: 7 });
    check('6.2', 'Thành viên thường tạo link → bị từ chối', s === 403 || s === 404, `nhận ${s}`);
  }
} catch (e) {
  console.log(`\n${R}Lỗi khi chạy: ${e.stack ?? e}${RS}`);
} finally {
  await cleanup();
}

console.log(`\n${Y}${'═'.repeat(62)}${RS}`);
if (fail.length === 0) {
  console.log(`${G}KẾT QUẢ: ${pass.length}/${pass.length} ĐẠT — link mời hoạt động đúng.${RS}\n`);
} else {
  console.log(`${R}KẾT QUẢ: ${pass.length}/${pass.length + fail.length} đạt, ${fail.length} HỎNG:${RS}`);
  for (const f of fail) console.log(`  ${R}✘${RS} ${f.code} ${f.desc}${f.why ? ` ${DIM}(${f.why})${RS}` : ''}`);
  console.log();
  process.exit(1);
}
