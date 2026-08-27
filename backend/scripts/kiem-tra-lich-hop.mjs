#!/usr/bin/env node
/**
 * Kiểm tra LỊCH HỌP GOOGLE CALENDAR (module meetings).
 *
 * CÁCH CHẠY:
 *     cd backend && npm run start:dev      # cửa sổ 1
 *     node scripts/kiem-tra-lich-hop.mjs   # cửa sổ 2
 *
 * Script dựng tổ chức/board/thành viên riêng, gọi REST thật, mở WebSocket thật
 * rồi DỌN SẠCH. Không đụng tới Google — sự kiện bên Google do trình duyệt tạo,
 * ở đây chỉ kiểm phần server: quyền, lọc người dự, chuông, và truy vấn nhắc lịch.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const G='\x1b[32m', R='\x1b[31m', Y='\x1b[33m', DIM='\x1b[2m', RS='\x1b[0m';
const pass = [], fail = [];

function check(desc, ok, why = '') {
  (ok ? pass : fail).push({ desc, why });
  console.log(`  ${ok ? G+'✔'+RS : R+'✘'+RS} ${desc}`);
  if (!ok && why) console.log(`      ${R}→ ${why}${RS}`);
}
const section = (t) => console.log(`\n${Y}── ${t} ${'─'.repeat(Math.max(0, 52 - t.length))}${RS}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    const env = JSON.parse(readFileSync(join(d, f), 'utf8'));
    const hit = env.values.find((v) => v.key === 'firebaseApiKey' && v.value);
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
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
               ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return [r.status, parsed];
}
async function sql(path, method = 'GET', body) {
  const url = readEnv('SUPABASE_URL'), key = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${url}/rest/v1/${path}`, {
    method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const t = await r.text();
  try { return t ? JSON.parse(t) : null; } catch { return t; }
}

function connect(token) {
  const socket = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false });
  const user = [];
  socket.on('user:event', (e) => user.push(e));
  return { socket, user };
}
const waitConnect = (c) => new Promise((res) => {
  c.socket.on('connect', () => res('connected'));
  c.socket.on('connect_error', () => res('error'));
  setTimeout(() => res('timeout'), 5000);
});
async function waitUserEvent(c, type, ms = 4000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const hit = c.user.find((e) => e.type === type);
    if (hit) return hit;
    await sleep(60);
  }
  return null;
}

console.log(`\n${Y}KIỂM TRA LỊCH HỌP GOOGLE CALENDAR${RS}\n${DIM}${BASE}${RS}\n`);
if (!API_KEY || (await api('GET', '/health'))[0] !== 200) {
  console.log(`${R}Thiếu firebaseApiKey hoặc backend chưa chạy.${RS}\n`); process.exit(1);
}

// ------------------------------------------------------------------ chuẩn bị
const seed = Date.now().toString(36);
const mk = async (n) => {
  const email = `lh-${n}-${seed}@test.dev`;
  let r = await firebase('signUp', email);
  if (!r.idToken) r = await firebase('signInWithPassword', email);
  await api('POST', '/auth/sync', r.idToken, {});
  return { email, token: r.idToken, uid: r.localId };
};
const [A, B, C, D] = await Promise.all([mk('a'), mk('b'), mk('c'), mk('d')]);
console.log(`${G}✔${RS} 4 tài khoản: A(owner) B,C(member) D(ngoài tổ chức)`);

const [stOrg, org] = await api('POST', '/organizations', A.token, { name: `LH ${seed}`, slug: `lh-${seed}` });
if (stOrg !== 201 || !org?.id) { console.log(`${R}Không tạo được tổ chức: ${stOrg} ${JSON.stringify(org)}${RS}`); process.exit(1); }
for (const u of [B, C]) {
  await sql('organization_members', 'POST', { org_id: org.id, user_id: u.uid, role: 'member' });
}
const [stWs, ws] = await api('POST', '/workspaces', A.token, { orgId: org.id, name: 'WS' });
if (!ws?.id) { console.log(`${R}Không tạo được workspace: ${stWs} ${JSON.stringify(ws)}${RS}`); process.exit(1); }
const [stBd, board] = await api('POST', '/boards', A.token, { workspaceId: ws.id, name: 'Board lịch họp' });
if (!board?.id) { console.log(`${R}Không tạo được board: ${stBd} ${JSON.stringify(board)}${RS}`); process.exit(1); }
console.log(`${G}✔${RS} org + workspace + board\n`);

const cA = connect(A.token), cB = connect(B.token), cC = connect(C.token);
await Promise.all([waitConnect(cA), waitConnect(cB), waitConnect(cC)]);

const gio = (phut) => new Date(Date.now() + phut * 60_000).toISOString();
const body = (over = {}) => ({
  boardId: board.id, title: 'Họp tuần', description: 'Điểm tiến độ',
  startAt: gio(60), endAt: gio(90), timeZone: 'Asia/Ho_Chi_Minh',
  remindMinutes: 10, attendeeIds: [B.uid], ...over,
});

// ------------------------------------------------------------------ 1. TẠO
section('1. TẠO LỊCH + BÁO CHUÔNG');
const [st1, m1] = await api('POST', '/meetings', A.token, body());
check('owner tạo được lịch', st1 === 201, `status ${st1} ${JSON.stringify(m1)}`);
check('người tạo tự động là người dự',
  !!m1?.attendees?.some((a) => a.id === A.uid),
  `attendees=${JSON.stringify(m1?.attendees?.map(a=>a.id))}`);
check('người được mời có trong danh sách', !!m1?.attendees?.some((a) => a.id === B.uid));

const evB = await waitUserEvent(cB, 'meeting.scheduled');
check('B được mời → nhận chuông', !!evB);
check('payload đủ để điều hướng',
  !!evB && !!evB.data?.orgSlug && evB.data?.boardId === board.id,
  JSON.stringify(evB?.data));
check('payload có tiêu đề + giờ bắt đầu',
  evB?.data?.title === 'Họp tuần' && !!evB?.data?.startAt);
check('C KHÔNG được mời → không nhận chuông',
  !cC.user.some((e) => e.type === 'meeting.scheduled'));
check('A (người tạo) không tự nhận chuông',
  !cA.user.some((e) => e.type === 'meeting.scheduled'));

// ------------------------------------------------------------------ 2. LỌC
section('2. LỌC NGƯỜI DỰ (không tin client)');
const [, m2] = await api('POST', '/meetings', A.token, body({ attendeeIds: [B.uid, D.uid] }));
const ids2 = (m2?.attendees ?? []).map((a) => a.id);
check('người NGOÀI tổ chức bị loại khỏi danh sách dự',
  !ids2.includes(D.uid), `attendees=${JSON.stringify(ids2)}`);
check('người hợp lệ vẫn giữ', ids2.includes(B.uid));

const [, m3] = await api('POST', '/meetings', A.token, body({ attendeeIds: ['uid-bia-dat-hoan-toan'] }));
check('uid bịa bị loại, không làm hỏng request',
  (m3?.attendees ?? []).every((a) => a.id !== 'uid-bia-dat-hoan-toan'));

// ------------------------------------------------------------------ 3. QUYỀN
section('3. QUYỀN');
const [stB] = await api('POST', '/meetings', B.token, body());
check('member thường KHÔNG tạo được lịch (403)', stB === 403, `status ${stB}`);
const [stD] = await api('POST', '/meetings', D.token, body());
check('người ngoài tổ chức nhận 404 (không phải 403)', stD === 404, `status ${stD}`);
const [stDs] = await api('GET', `/meetings?boardId=${board.id}`, D.token);
check('người ngoài không đọc được lịch của board', stDs === 404, `status ${stDs}`);

// ------------------------------------------------------------------ 4. DTO
section('4. CHẶN DỮ LIỆU XẤU');
const [stEnd] = await api('POST', '/meetings', A.token, body({ endAt: gio(30) }));
check('kết thúc trước khi bắt đầu → 400', stEnd === 400, `status ${stEnd}`);
const [stMeet] = await api('POST', '/meetings', A.token, body({ meetUrl: 'javascript:alert(1)' }));
check('meetUrl javascript: bị chặn', stMeet === 400, `status ${stMeet}`);
const [stLink] = await api('POST', '/meetings', A.token, body({ googleHtmlLink: 'https://ke-gian.example/x' }));
check('googleHtmlLink lạ host bị chặn', stLink === 400, `status ${stLink}`);
const [stTz] = await api('POST', '/meetings', A.token, body({ timeZone: 'Asia/Ho Chi Minh; DROP' }));
check('timeZone rác bị chặn', stTz === 400, `status ${stTz}`);
const [stRm] = await api('POST', '/meetings', A.token, body({ remindMinutes: 99999 }));
check('remindMinutes vượt trần bị chặn', stRm === 400, `status ${stRm}`);

// ------------------------------------------------------------------ 5. NHẮC
section('5. TRUY VẤN NHẮC LỊCH');
const [, upB] = await api('GET', '/meetings/my-upcoming', B.token);
check('B thấy cuộc họp mình được mời',
  Array.isArray(upB) && upB.some((m) => m.id === m1.id), JSON.stringify(upB)?.slice(0, 160));
const cuoc = (upB ?? []).find((m) => m.id === m1.id);
check('kèm đủ boardName + orgSlug để điều hướng',
  !!cuoc?.boardName && !!cuoc?.orgSlug, JSON.stringify(cuoc));
check('kèm remindMinutes để client tự đặt hẹn giờ', cuoc?.remindMinutes === 10);

const [, upC] = await api('GET', '/meetings/my-upcoming', C.token);
check('C không được mời → không thấy cuộc nào',
  Array.isArray(upC) && !upC.some((m) => m.id === m1.id), JSON.stringify(upC)?.slice(0, 160));

// Cuộc họp ngoài cửa sổ 25 giờ thì không được trả về.
const [, mXa] = await api('POST', '/meetings', A.token,
  body({ startAt: gio(60 * 48), endAt: gio(60 * 49), title: 'Họp tuần sau' }));
const [, upB2] = await api('GET', '/meetings/my-upcoming', B.token);
check('cuộc họp sau 48 giờ chưa lọt vào cửa sổ nhắc',
  !upB2.some((m) => m.id === mXa.id));

// Cuộc họp đã qua thì cũng không.
const [, mCu] = await api('POST', '/meetings', A.token,
  body({ startAt: gio(-180), endAt: gio(-120), title: 'Họp hôm qua' }));
const [, upB3] = await api('GET', '/meetings/my-upcoming', B.token);
check('cuộc họp đã qua không còn nhắc', !upB3.some((m) => m.id === mCu.id));

// ------------------------------------------------------------------ 6. HUỶ
section('6. HUỶ');
const [stHuyC] = await api('DELETE', `/meetings/${m1.id}`, C.token);
check('member thường không huỷ được (403)', stHuyC === 403, `status ${stHuyC}`);
const [stHuyD] = await api('DELETE', `/meetings/${m1.id}`, D.token);
check('người ngoài tổ chức nhận 404', stHuyD === 404, `status ${stHuyD}`);

cB.user.length = 0;
const [stHuy, huy] = await api('DELETE', `/meetings/${m1.id}`, A.token);
check('người tạo huỷ được', stHuy === 200, `status ${stHuy}`);
const evHuy = await waitUserEvent(cB, 'meeting.canceled');
check('người được mời nhận chuông báo huỷ', !!evHuy);

const [, upSauHuy] = await api('GET', '/meetings/my-upcoming', B.token);
check('huỷ rồi thì không nhắc nữa', !upSauHuy.some((m) => m.id === m1.id));

const conRow = await sql(`board_meetings?id=eq.${m1.id}&select=id,canceled_at`);
check('huỷ MỀM — dòng vẫn còn trong database',
  Array.isArray(conRow) && conRow.length === 1 && !!conRow[0].canceled_at,
  JSON.stringify(conRow));

const [, huy2] = await api('DELETE', `/meetings/${m1.id}`, A.token);
check('huỷ lần hai không nổ', huy2?.id === m1.id);

const [, ds] = await api('GET', `/meetings?boardId=${board.id}`, A.token);
check('cuộc đã huỷ biến khỏi danh sách của board',
  Array.isArray(ds) && !ds.some((m) => m.id === m1.id));
check('cuộc đã qua cũng không nằm trong danh sách',
  Array.isArray(ds) && !ds.some((m) => m.id === mCu.id));

// ------------------------------------------------------------------ 7. GOOGLE LINKED
section('7. CỜ LIÊN KẾT GOOGLE');
const [, mems] = await api('GET', `/boards/${board.id}/members`, A.token);
const mB = (mems ?? []).find((m) => m.userId === B.uid);
check('danh sách thành viên có cờ googleLinked',
  mB && typeof mB.user?.googleLinked === 'boolean', JSON.stringify(mB?.user));
check('tài khoản mật khẩu thuần → googleLinked = false', mB?.user?.googleLinked === false);
check('KHÔNG lộ google_linked_at ra ngoài',
  mB && !('google_linked_at' in (mB.user ?? {})));

const [, me] = await api('GET', '/auth/me', A.token);
check('/auth/me trả googleLinked', typeof me?.user?.googleLinked === 'boolean');

// ------------------------------------------------------------------ dọn
section('DỌN DẸP');
for (const c of [cA, cB, cC]) c.socket.disconnect();
await sql(`board_meetings?board_id=eq.${board.id}`, 'DELETE');
await api('DELETE', `/boards/${board.id}`, A.token);
await api('DELETE', `/workspaces/${ws.id}`, A.token);
await sql(`organizations?id=eq.${org.id}`, 'DELETE');
for (const u of [A, B, C, D]) await sql(`users?id=eq.${u.uid}`, 'DELETE');
console.log(`  ${DIM}đã xoá dữ liệu test${RS}`);

console.log(`\n${Y}${'─'.repeat(56)}${RS}`);
console.log(`  ${G}${pass.length} đạt${RS}   ${fail.length ? R : DIM}${fail.length} hỏng${RS}`);
if (fail.length) { fail.forEach((f) => console.log(`  ${R}✘${RS} ${f.desc} ${DIM}${f.why}${RS}`)); process.exit(1); }
console.log(`  ${G}Tất cả đạt.${RS}\n`);
