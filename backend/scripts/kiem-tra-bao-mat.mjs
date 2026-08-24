#!/usr/bin/env node
/**
 * Kiểm tra bảo mật hai tầng: BOARD và TỔ CHỨC.
 *
 * CÁCH CHẠY:
 *     cd backend
 *     npm run start:dev                       # cửa sổ 1
 *     node scripts/kiem-tra-bao-mat.mjs       # cửa sổ 2
 *
 * Đúng hai kịch bản đã đặt ra:
 *
 * 1. TẦNG BOARD — trong cùng một workspace:
 *      boardA có A, B   ·   boardB có A, C
 *    A gửi link boardA cho B và C:
 *      B bấm → VÀO ĐƯỢC (được mời từ trước)
 *      C bấm → BỊ TỪ CHỐI (không có tên trong board)
 *
 * 2. TẦNG TỔ CHỨC:
 *      D không thuộc tổ chức. D mò được link → từ chối SẠCH ở mọi ngõ.
 *
 * ⚠️ Không chỉ thử đúng một endpoint. Lỗ hổng luôn nằm ở tài nguyên CON
 *    (list, card, bình luận, chat, nhật ký) — nơi người viết quên kiểm tra
 *    vì nghĩ "đã chặn ở board rồi".
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
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
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
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
async function supabase(method, path) {
  const url = readEnv('SUPABASE_URL'), key = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  await fetch(`${url}/rest/v1/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}` } });
}

/** Bị chặn nghĩa là 403 hoặc 404 — KHÔNG được là 200/201. */
const biChan = (s) => s === 403 || s === 404;

console.log(`\n${Y}KIỂM TRA BẢO MẬT — TẦNG BOARD & TẦNG TỔ CHỨC${RS}`);
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
console.log(`${G}✔${RS} A (chủ tổ chức) · B, C (thành viên) · D (NGƯỜI NGOÀI)`);

const STAMP = Date.now();
const SLUG = `kt-bm-${STAMP}`;
const [, org] = await api('POST', '/organizations', A, { name: 'KT Bảo mật', slug: SLUG });
const OID = org.id;

async function cleanup() {
  await supabase('DELETE', `organizations?id=eq.${OID}`);
  await supabase('DELETE', `organization_invites?org_id=eq.${OID}`);
}

try {
  // ───────────────────────────────── chuẩn bị: kéo B và C vào tổ chức
  for (const [uid, tok] of [[B_UID, B], [C_UID, C]]) {
    const [, inv] = await api('POST', `/organizations/${OID}/invites`, A, { toUserId: uid, role: 'member' });
    await api('PATCH', `/organizations/invites/${inv.id}`, tok, { accept: true });
  }
  console.log(`${G}✔${RS} B và C đã vào tổ chức; D đứng ngoài\n`);

  const [, ws] = await api('POST', '/workspaces', A, { orgId: OID, name: 'WorkspaceA' });
  const WSID = ws.id;

  // boardA: chỉ A và B  |  boardB: chỉ A và C
  const [, bA] = await api('POST', '/boards', A, {
    workspaceId: WSID, name: 'BoardA', visibility: 'private', memberIds: [A_UID, B_UID],
  });
  const [, bB] = await api('POST', '/boards', A, {
    workspaceId: WSID, name: 'BoardB', visibility: 'private', memberIds: [A_UID, C_UID],
  });
  const BOARD_A = bA?.id, BOARD_B = bB?.id;

  if (!BOARD_A || !BOARD_B) {
    console.log(`${R}Không tạo được board private kèm memberIds — dừng.${RS}`);
    console.log(`${DIM}bA=${JSON.stringify(bA)}\nbB=${JSON.stringify(bB)}${RS}`);
    await cleanup();
    process.exit(1);
  }
  console.log(`${G}✔${RS} BoardA{A,B} · BoardB{A,C} — cùng nằm trong WorkspaceA\n`);

  // Tạo sẵn nội dung trong boardA để thử các tài nguyên CON.
  const [, listA] = await api('POST', '/lists', A, { boardId: BOARD_A, name: 'Cột A' });
  const [, cardA] = await api('POST', '/cards', A, { listId: listA.id, title: 'Thẻ mật' });

  // ═══════════════════════════════════════════ 1. TẦNG BOARD
  section('1. TẦNG BOARD — B vào được, C bị chặn');

  {
    const [s] = await api('GET', `/boards/${BOARD_A}`, B);
    check('1.1', 'B (có tên trong BoardA) mở BoardA → vào được', s === 200, `nhận ${s}`);
  }
  {
    const [s] = await api('GET', `/boards/${BOARD_A}`, C);
    check('1.2', 'C (KHÔNG có tên) mở BoardA → bị từ chối', biChan(s), `nhận ${s} (phải 403/404)`);
  }
  {
    const [s] = await api('GET', `/boards/${BOARD_B}`, C);
    check('1.3', 'C mở BoardB (có tên) → vào được', s === 200, `nhận ${s}`);
  }
  {
    const [s] = await api('GET', `/boards/${BOARD_B}`, B);
    check('1.4', 'B mở BoardB (không có tên) → bị từ chối', biChan(s), `nhận ${s}`);
  }
  {
    const [, list] = await api('GET', `/boards?workspaceId=${WSID}`, C);
    const ten = (list ?? []).map((b) => b.name);
    check('1.5', 'C liệt kê board → KHÔNG thấy BoardA trong danh sách',
      Array.isArray(list) && !ten.includes('BoardA'), `thấy ${JSON.stringify(ten)}`);
  }

  section('1b. TÀI NGUYÊN CON CỦA BOARD — chỗ hay quên nhất');

  {
    const [s] = await api('GET', `/lists?boardId=${BOARD_A}`, C);
    const [, data] = await api('GET', `/lists?boardId=${BOARD_A}`, C);
    check('1.6', 'C đọc danh sách cột của BoardA → chặn hoặc rỗng',
      biChan(s) || (Array.isArray(data) && data.length === 0), `nhận ${s}, ${JSON.stringify(data)?.slice(0, 80)}`);
  }
  {
    const [s] = await api('GET', `/cards?boardId=${BOARD_A}`, C);
    const [, data] = await api('GET', `/cards?boardId=${BOARD_A}`, C);
    check('1.7', 'C đọc thẻ của BoardA → chặn hoặc rỗng',
      biChan(s) || (Array.isArray(data) && data.length === 0), `nhận ${s}`);
  }
  {
    const [s] = await api('GET', `/cards/${cardA.id}`, C);
    check('1.8', 'C mở thẳng 1 thẻ trong BoardA → bị từ chối', biChan(s), `nhận ${s}`);
  }
  {
    const [s] = await api('POST', '/lists', C, { boardId: BOARD_A, name: 'Chen ngang' });
    check('1.9', 'C tạo cột trong BoardA → bị từ chối', biChan(s), `nhận ${s}`);
  }
  {
    const [s] = await api('PATCH', `/cards/${cardA.id}`, C, { title: 'Đổi trộm' });
    check('1.10', 'C sửa thẻ trong BoardA → bị từ chối', biChan(s), `nhận ${s}`);
  }
  {
    const [s] = await api('DELETE', `/boards/${BOARD_A}`, C);
    check('1.11', 'C xoá BoardA → bị từ chối', biChan(s), `nhận ${s}`);
  }
  {
    const [s] = await api('GET', `/chat?boardId=${BOARD_A}`, C);
    const [, data] = await api('GET', `/chat?boardId=${BOARD_A}`, C);
    check('1.12', 'C đọc chat của BoardA → chặn hoặc rỗng',
      biChan(s) || (Array.isArray(data) && data.length === 0), `nhận ${s}`);
  }
  {
    const [s] = await api('POST', '/chat', C, { boardId: BOARD_A, content: 'nghe lén' });
    check('1.13', 'C gửi chat vào BoardA → bị từ chối', biChan(s), `nhận ${s}`);
  }
  {
    const [s] = await api('GET', `/activity?boardId=${BOARD_A}`, C);
    const [, data] = await api('GET', `/activity?boardId=${BOARD_A}`, C);
    check('1.14', 'C đọc nhật ký BoardA → chặn hoặc rỗng',
      biChan(s) || (Array.isArray(data) && data.length === 0), `nhận ${s}`);
  }
  {
    const [s] = await api('GET', `/boards/${BOARD_A}/members`, C);
    check('1.15', 'C xem danh sách thành viên BoardA → bị từ chối', biChan(s), `nhận ${s}`);
  }

  // ═══════════════════════════════════════════ 2. TẦNG TỔ CHỨC
  section('2. TẦNG TỔ CHỨC — D ở ngoài, chặn sạch mọi ngõ');

  {
    const [s] = await api('GET', `/organizations/${OID}/members`, D);
    check('2.1', 'D xem thành viên tổ chức → bị từ chối', biChan(s), `nhận ${s}`);
  }
  {
    const [, list] = await api('GET', '/organizations', D);
    const co = Array.isArray(list) && list.some((o) => o.id === OID);
    check('2.2', 'D liệt kê tổ chức → không thấy tổ chức này', !co, 'tổ chức lọt vào danh sách của D');
  }
  {
    const [s] = await api('GET', `/workspaces?orgId=${OID}`, D);
    const [, data] = await api('GET', `/workspaces?orgId=${OID}`, D);
    check('2.3', 'D liệt kê workspace của tổ chức → chặn hoặc rỗng',
      biChan(s) || (Array.isArray(data) && data.length === 0), `nhận ${s}, ${JSON.stringify(data)?.slice(0, 80)}`);
  }
  {
    const [s] = await api('GET', `/boards?workspaceId=${WSID}`, D);
    const [, data] = await api('GET', `/boards?workspaceId=${WSID}`, D);
    check('2.4', 'D liệt kê board trong workspace → chặn hoặc rỗng',
      biChan(s) || (Array.isArray(data) && data.length === 0), `nhận ${s}`);
  }
  {
    const [s] = await api('GET', `/boards/${BOARD_B}`, D);
    check('2.5', 'D mở thẳng link board → bị từ chối', biChan(s), `nhận ${s}`);
  }
  {
    const [s] = await api('GET', `/cards/${cardA.id}`, D);
    check('2.6', 'D mở thẳng link thẻ → bị từ chối', biChan(s), `nhận ${s}`);
  }
  {
    const [s] = await api('POST', '/workspaces', D, { orgId: OID, name: 'Chen ngang' });
    check('2.7', 'D tạo workspace trong tổ chức → bị từ chối', biChan(s), `nhận ${s}`);
  }
  {
    const [s] = await api('PATCH', `/organizations/${OID}`, D, { name: 'Chiếm' });
    check('2.8', 'D đổi tên tổ chức → bị từ chối', biChan(s), `nhận ${s}`);
  }
  {
    const [s] = await api('POST', `/organizations/${OID}/invites`, D, { toUserId: D_UID, role: 'admin' });
    check('2.9', 'D tự mời mình vào làm admin → bị từ chối', biChan(s), `nhận ${s}`);
  }
  {
    const [s] = await api('DELETE', `/organizations/${OID}/members/${A_UID}`, D);
    check('2.10', 'D đá chủ tổ chức ra → bị từ chối', biChan(s), `nhận ${s}`);
  }
  {
    const [s] = await api('GET', `/organizations/${OID}/invites`, D);
    check('2.11', 'D xem danh sách lời mời → bị từ chối', biChan(s), `nhận ${s}`);
  }
  {
    const [s] = await api('GET', `/stats/workspace?workspaceId=${WSID}`, D);
    const [, data] = await api('GET', `/stats/workspace?workspaceId=${WSID}`, D);
    check('2.12', 'D xem thống kê workspace → chặn hoặc rỗng',
      biChan(s) || data == null || (typeof data === 'object' && (data.totalBoards ?? 0) === 0), `nhận ${s}`);
  }

  section('3. KHÔNG RÒ RỈ "CÓ TỒN TẠI HAY KHÔNG"');

  {
    const KHONG_CO = '00000000-0000-0000-0000-000000000000';
    const [sThat] = await api('GET', `/boards/${BOARD_A}`, C);   // có thật, không có quyền
    const [sMa] = await api('GET', `/boards/${KHONG_CO}`, C);    // không tồn tại
    check('3.1', 'Board có thật (không quyền) và board không tồn tại trả CÙNG mã',
      sThat === sMa, `có thật=${sThat}, không tồn tại=${sMa} — khác nhau là dò được id`);
  }
  {
    const KHONG_CO = '00000000-0000-0000-0000-000000000000';
    const [sThat] = await api('GET', `/organizations/${OID}/members`, D);
    const [sMa] = await api('GET', `/organizations/${KHONG_CO}/members`, D);
    check('3.2', 'Tổ chức có thật và không tồn tại trả CÙNG mã cho người ngoài',
      sThat === sMa, `có thật=${sThat}, không tồn tại=${sMa}`);
  }
} catch (e) {
  console.log(`\n${R}Lỗi khi chạy: ${e.stack ?? e}${RS}`);
} finally {
  await cleanup();
}

console.log(`\n${Y}${'═'.repeat(62)}${RS}`);
if (fail.length === 0) {
  console.log(`${G}KẾT QUẢ: ${pass.length}/${pass.length} ĐẠT — bảo mật hai tầng kín.${RS}\n`);
} else {
  console.log(`${R}KẾT QUẢ: ${pass.length}/${pass.length + fail.length} đạt, ${fail.length} THỦNG:${RS}`);
  for (const f of fail) console.log(`  ${R}✘${RS} ${f.code} ${f.desc}${f.why ? ` ${DIM}(${f.why})${RS}` : ''}`);
  console.log();
  process.exit(1);
}
