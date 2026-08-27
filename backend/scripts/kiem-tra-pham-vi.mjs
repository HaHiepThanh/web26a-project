#!/usr/bin/env node
/**
 * Kiểm tra tự động: phạm vi hiển thị workspace/board, tìm người dùng, quyền khi
 * mời vào tổ chức, và thông báo lời mời qua WebSocket.
 *
 * CÁCH CHẠY:
 *     cd backend
 *     npm run start:dev                      # cửa sổ 1
 *     node scripts/kiem-tra-pham-vi.mjs      # cửa sổ 2
 *
 * ⚠️ Cần chạy migrations/0003_*.sql trước (thêm cột workspaces.visibility và
 *    organization_invites.role).
 *
 * Kịch bản: tổ chức của A có 3 người (A, B, C).
 *   - workspace "Mở"     → visibility 'org'        → cả 3 thấy
 *   - workspace "Kín"    → visibility 'restricted' → chỉ A và B
 *   - trong "Kín": board 'workspace' → A,B thấy; board 'private' chỉ A
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  return [r.status, text ? JSON.parse(text) : null];
}
async function supabase(method, path) {
  const url = readEnv('SUPABASE_URL'), key = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  await fetch(`${url}/rest/v1/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}` } });
}

console.log(`\n${Y}KIỂM TRA PHẠM VI HIỂN THỊ + QUYỀN + TÌM NGƯỜI DÙNG${RS}`);
console.log(`${DIM}${BASE}${RS}\n`);

if (!API_KEY || (await api('GET', '/health'))[0] !== 200) {
  console.log(`${R}Thiếu firebaseApiKey hoặc backend chưa chạy.${RS}\n`);
  process.exit(1);
}

// Migration đã chạy chưa? Không có cột thì mọi phép thử dưới đều sai lệch.
{
  const url = readEnv('SUPABASE_URL'), key = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${url}/rest/v1/workspaces?select=visibility&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) {
    console.log(`${R}Chưa chạy migrations/0003_*.sql — thiếu cột workspaces.visibility.${RS}`);
    console.log(`${DIM}Mở Supabase → SQL Editor → dán file đó → Run, rồi chạy lại.${RS}\n`);
    process.exit(1);
  }
}
console.log(`${G}✔${RS} Backend đang chạy, migration 0003 đã áp dụng`);

const EMAILS = ['hocvien-a@test.dev', 'kiemtra-b@test.dev', 'kiemtra-c@test.dev', 'kiemtra-d@test.dev'];
for (const e of EMAILS) await firebase('signUp', e);
const [ra, rb, rc, rd] = await Promise.all(EMAILS.map((e) => firebase('signInWithPassword', e)));
const A = ra.idToken, B = rb.idToken, C = rc.idToken, D = rd.idToken;
const A_UID = ra.localId, B_UID = rb.localId, C_UID = rc.localId, D_UID = rd.localId;
for (const t of [A, B, C, D]) await api('GET', '/auth/me', t);
console.log(`${G}✔${RS} A (chủ) · B, C (thành viên) · D (người ngoài)`);

const STAMP = Date.now();
const OID = (await api('POST', '/organizations', A, { name: 'KT Phạm vi', slug: `kt-pv-${STAMP}` }))[1].id;

const sockets = [];
async function cleanup() {
  for (const s of sockets) s.close();
  await supabase('DELETE', `organizations?id=eq.${OID}`);
  await supabase('DELETE', `organization_invites?org_id=eq.${OID}`);
}

try {
  // ------------------------------------------------------- 1. MỜI KÈM QUYỀN
  section('1. MỜI VÀO TỔ CHỨC KÈM QUYỀN');

  // B nối WebSocket TRƯỚC khi được mời, để bắt sự kiện.
  const bSocket = io(BASE, { auth: { token: B }, transports: ['websocket'] });
  sockets.push(bSocket);
  const bEvents = [];
  bSocket.on('user:event', (e) => bEvents.push(e));
  await new Promise((res) => { bSocket.on('connect', res); setTimeout(res, 5000); });
  check('1.1', 'B nối được WebSocket trước khi vào tổ chức', bSocket.connected);

  const [stAdmin, invAdmin] = await api('POST', `/organizations/${OID}/invites`, A, { toUserId: B_UID, role: 'admin' });
  check('1.2', 'mời B làm admin → 201', stAdmin === 201, `nhận ${stAdmin}`);
  check('1.3', 'lời mời trả về role đã chọn', invAdmin?.role === 'admin', JSON.stringify(invAdmin));

  const [stOwner] = await api('POST', `/organizations/${OID}/invites`, A, { toUserId: C_UID, role: 'owner' });
  check('1.4', "mời làm 'owner' → 400 (mỗi tổ chức chỉ 1 owner)", stOwner === 400, `nhận ${stOwner}`);

  const [stMem, invMem] = await api('POST', `/organizations/${OID}/invites`, A, { toUserId: C_UID, role: 'member' });
  check('1.5', 'mời C làm member → 201', stMem === 201, `nhận ${stMem}`);

  const myInv = (await api('GET', '/organizations/invites/me', B))[1];
  check('1.6', 'B thấy lời mời kèm role', myInv?.[0]?.role === 'admin', JSON.stringify(myInv?.[0]));

  // ------------------------------------------- 2. THÔNG BÁO REALTIME
  section('2. LỜI MỜI VỀ NGAY QUA WEBSOCKET (KHÔNG F5)');

  await sleep(600);
  const ev = bEvents.find((e) => e.type === 'invite.created');
  check('2.1', 'B nhận sự kiện "invite.created" mà không cần gọi API', !!ev,
    `nhận ${bEvents.length} sự kiện: ${bEvents.map((e) => e.type).join(', ') || '(không có)'}`);
  check('2.2', 'kèm sẵn tên tổ chức (khỏi phải gọi thêm API)', !!ev?.data?.orgName, JSON.stringify(ev?.data));
  check('2.3', 'kèm role sẽ nhận', ev?.data?.role === 'admin', JSON.stringify(ev?.data));
  check('2.4', 'kèm tên người mời', !!ev?.data?.fromUser, JSON.stringify(ev?.data?.fromUser));

  // D (người ngoài) không được nhận lời mời của B
  const dSocket = io(BASE, { auth: { token: D }, transports: ['websocket'] });
  sockets.push(dSocket);
  const dEvents = [];
  dSocket.on('user:event', (e) => dEvents.push(e));
  await new Promise((res) => { dSocket.on('connect', res); setTimeout(res, 5000); });
  await api('POST', `/organizations/${OID}/invites`, A, { toUserId: B_UID });
  await sleep(600);
  check('2.5', '🔒 D không nhận lời mời gửi cho người khác', dEvents.length === 0,
    `D nhận ${dEvents.length} sự kiện`);

  // B, C đồng ý vào tổ chức
  await api('PATCH', `/organizations/invites/${invAdmin.id}`, B, { accept: true });
  await api('PATCH', `/organizations/invites/${invMem.id}`, C, { accept: true });

  const members = (await api('GET', `/organizations/${OID}/members`, A))[1];
  const roleB = members.find((m) => m.userId === B_UID)?.role;
  const roleC = members.find((m) => m.userId === C_UID)?.role;
  check('2.6', 'B vào tổ chức ĐÚNG với quyền admin đã chọn', roleB === 'admin', `nhận ${roleB}`);
  check('2.7', 'C vào tổ chức với quyền member', roleC === 'member', `nhận ${roleC}`);
  check('2.8', 'tổ chức có đủ 3 người', members.length === 3, `nhận ${members.length}`);

  // ------------------------------------------------- 3. TÌM NGƯỜI DÙNG
  section('3. TÌM NGƯỜI DÙNG (ô "thêm thành viên")');

  const byUuid = (await api('GET', `/users/search?q=${B_UID}`, A))[1];
  check('3.1', 'dán uuid của B → ra ĐÚNG B', byUuid?.length === 1 && byUuid[0].id === B_UID,
    JSON.stringify(byUuid));
  check('3.2', 'kèm email thật của B (không phải email bịa)', byUuid?.[0]?.email === 'kiemtra-b@test.dev',
    `nhận "${byUuid?.[0]?.email}"`);

  const byEmail = (await api('GET', `/users/search?q=kiemtra-c@test.dev`, A))[1];
  check('3.3', 'gõ đúng email → ra đúng người', byEmail?.length === 1 && byEmail[0].id === C_UID,
    JSON.stringify(byEmail));

  const khongThay = (await api('GET', `/users/search?q=khong-ton-tai-${STAMP}@test.dev`, A))[1];
  check('3.4', 'email không tồn tại → mảng RỖNG (không bịa ra người)', khongThay?.length === 0,
    JSON.stringify(khongThay));

  const quaNgan = (await api('GET', '/users/search?q=ab', A))[1];
  check('3.5', 'query dưới 3 ký tự → rỗng (không cho dò cả bảng)', quaNgan?.length === 0,
    JSON.stringify(quaNgan));

  const tuTim = (await api('GET', `/users/search?q=${A_UID}`, A))[1];
  check('3.6', 'không tự tìm ra chính mình', tuTim?.length === 0, JSON.stringify(tuTim));

  // ------------------------------------------------ 4. PHẠM VI WORKSPACE
  section('4. PHẠM VI HIỂN THỊ CỦA WORKSPACE');

  const wsMo = (await api('POST', '/workspaces', A, { orgId: OID, name: 'WS Mở' }))[1];
  check('4.1', 'mặc định là "cả tổ chức thấy"', wsMo?.visibility === 'org', JSON.stringify(wsMo));

  const [stKin, wsKin] = await api('POST', '/workspaces', A, {
    orgId: OID, name: 'WS Kín', visibility: 'restricted', memberIds: [B_UID],
  });
  check('4.2', 'tạo workspace chỉ định thành viên → 201', stKin === 201, `nhận ${stKin}: ${JSON.stringify(wsKin)}`);
  check('4.3', 'người tạo tự được thêm vào', wsKin?.memberIds?.includes(A_UID), JSON.stringify(wsKin?.memberIds));
  check('4.4', 'B có trong danh sách', wsKin?.memberIds?.includes(B_UID), JSON.stringify(wsKin?.memberIds));
  check('4.5', 'C KHÔNG có trong danh sách', !wsKin?.memberIds?.includes(C_UID), JSON.stringify(wsKin?.memberIds));

  const [stNgoai] = await api('POST', '/workspaces', A, {
    orgId: OID, name: 'WS Sai', visibility: 'restricted', memberIds: [D_UID],
  });
  check('4.6', '🔒 chỉ định người NGOÀI tổ chức → 400', stNgoai === 400, `nhận ${stNgoai}`);

  const wsCuaA = (await api('GET', `/workspaces?orgId=${OID}`, A))[1];
  const wsCuaB = (await api('GET', `/workspaces?orgId=${OID}`, B))[1];
  const wsCuaC = (await api('GET', `/workspaces?orgId=${OID}`, C))[1];
  check('4.7', 'A thấy cả 2 workspace', wsCuaA?.length === 2, `nhận ${wsCuaA?.length}`);
  check('4.8', 'B thấy cả 2 (được chỉ định vào WS Kín)', wsCuaB?.length === 2, `nhận ${wsCuaB?.length}`);
  check('4.9', '🔒 C chỉ thấy 1 (không được chỉ định)', wsCuaC?.length === 1, `nhận ${wsCuaC?.length}`);
  check('4.10', '🔒 C không thấy tên "WS Kín"', !wsCuaC?.some((w) => w.name === 'WS Kín'),
    JSON.stringify(wsCuaC?.map((w) => w.name)));

  const [stCXem] = await api('GET', `/workspaces/${wsKin.id}/members`, C);
  check('4.11', '🔒 C mở thẳng workspace kín → 404', stCXem === 404, `nhận ${stCXem}`);

  // ----------------------------------------- 5. VÙNG CHỌN THÀNH VIÊN BOARD
  section('5. VÙNG CHỌN THÀNH VIÊN BOARD BỊ LỌC THEO WORKSPACE');

  const tvMo = (await api('GET', `/workspaces/${wsMo.id}/members`, A))[1];
  check('5.1', 'workspace mở → vùng chọn là CẢ 3 người của tổ chức', tvMo?.length === 3,
    `nhận ${tvMo?.length}`);

  const tvKin = (await api('GET', `/workspaces/${wsKin.id}/members`, A))[1];
  check('5.2', 'workspace kín → vùng chọn chỉ còn 2 (A, B)', tvKin?.length === 2, `nhận ${tvKin?.length}`);
  check('5.3', 'kèm email để giao diện vẽ được', !!tvKin?.[0]?.user?.email, JSON.stringify(tvKin?.[0]));

  const [stBoardSai] = await api('POST', '/boards', A, {
    workspaceId: wsKin.id, name: 'Board sai', visibility: 'private', memberIds: [C_UID],
  });
  check('5.4', '🔒 chọn C (ngoài workspace kín) vào board → 400', stBoardSai === 400, `nhận ${stBoardSai}`);

  // --------------------------------------------------- 6. PHẠM VI BOARD
  section('6. PHẠM VI HIỂN THỊ CỦA BOARD');

  const bChung = (await api('POST', '/boards', A, { workspaceId: wsKin.id, name: 'Board chung' }))[1];
  check('6.1', 'mặc định là "cả workspace thấy"', bChung?.visibility === 'workspace', JSON.stringify(bChung));

  const [stRieng, bRieng] = await api('POST', '/boards', A, {
    workspaceId: wsKin.id, name: 'Board riêng', visibility: 'private', memberIds: [],
  });
  check('6.2', 'tạo board chỉ định → 201', stRieng === 201, `nhận ${stRieng}: ${JSON.stringify(bRieng)}`);
  check('6.3', 'người tạo tự được thêm', bRieng?.memberIds?.includes(A_UID), JSON.stringify(bRieng?.memberIds));

  const bOfA = (await api('GET', `/boards?workspaceId=${wsKin.id}`, A))[1];
  const bOfB = (await api('GET', `/boards?workspaceId=${wsKin.id}`, B))[1];
  check('6.4', 'A thấy cả 2 board', bOfA?.length === 2, `nhận ${bOfA?.length}`);
  check('6.5', '🔒 B chỉ thấy board chung, KHÔNG thấy board riêng của A', bOfB?.length === 1,
    `nhận ${bOfB?.length}: ${JSON.stringify(bOfB?.map((b) => b.name))}`);

  const [stBMoRieng] = await api('GET', `/boards/${bRieng.id}`, B);
  check('6.6', '🔒 B mở thẳng board riêng → 404', stBMoRieng === 404, `nhận ${stBMoRieng}`);

  const [stCMoWs] = await api('GET', `/boards?workspaceId=${wsKin.id}`, C);
  check('6.7', '🔒 C liệt kê board trong workspace kín → 404', stCMoWs === 404, `nhận ${stCMoWs}`);

  // Thêm B vào board riêng → B thấy được
  await api('PATCH', `/boards/${bRieng.id}`, A, { memberIds: [B_UID] });
  const bOfB2 = (await api('GET', `/boards?workspaceId=${wsKin.id}`, B))[1];
  check('6.8', 'thêm B vào board riêng → B thấy cả 2', bOfB2?.length === 2, `nhận ${bOfB2?.length}`);

  const tvBoard = (await api('GET', `/boards/${bRieng.id}/members`, A))[1];
  check('6.9', 'GET /boards/:id/members trả đúng 2 người', tvBoard?.length === 2,
    JSON.stringify(tvBoard?.map((m) => m.userId)));

  const tvBoardChung = (await api('GET', `/boards/${bChung.id}/members`, A))[1];
  check('6.10', 'board chung → thành viên là cả workspace (2 người)', tvBoardChung?.length === 2,
    `nhận ${tvBoardChung?.length}`);

  // ------------------------------------------- 7. ĐỔI PHẠM VI WORKSPACE
  section('7. ĐỔI PHẠM VI SAU KHI ĐÃ TẠO');

  await api('PATCH', `/workspaces/${wsMo.id}`, A, { visibility: 'restricted', memberIds: [C_UID] });
  const wsCuaB2 = (await api('GET', `/workspaces?orgId=${OID}`, B))[1];
  check('7.1', 'chuyển "WS Mở" thành kín (A, C) → B không còn thấy', wsCuaB2?.length === 1,
    `nhận ${wsCuaB2?.length}: ${JSON.stringify(wsCuaB2?.map((w) => w.name))}`);

  await api('PATCH', `/workspaces/${wsMo.id}`, A, { visibility: 'org' });
  const wsCuaB3 = (await api('GET', `/workspaces?orgId=${OID}`, B))[1];
  check('7.2', 'mở lại cho cả tổ chức → B thấy lại', wsCuaB3?.length === 2, `nhận ${wsCuaB3?.length}`);

  const wsMoLai = wsCuaB3?.find((w) => w.id === wsMo.id);
  check('7.3', 'workspace "org" trả memberIds rỗng (cả tổ chức thấy)', wsMoLai?.memberIds?.length === 0,
    JSON.stringify(wsMoLai?.memberIds));
  // ------------------------------------------- 8. PHÂN QUYỀN QUẢN LÝ
  section('8. 🔒 THÀNH VIÊN THƯỜNG KHÔNG QUẢN LÝ ĐƯỢC');

  // Mở lại "WS Mở" cho cả tổ chức để C vào được, rồi thử các thao tác quản lý.
  const wsCuaC2 = (await api('GET', `/workspaces?orgId=${OID}`, C))[1];
  const wsC = wsCuaC2[0];

  const [stCTaoWs] = await api('POST', '/workspaces', C, { orgId: OID, name: 'C thu tao' });
  check('8.1', '🔒 member TẠO workspace → 403', stCTaoWs === 403, `nhận ${stCTaoWs}`);

  const [stCSuaWs] = await api('PATCH', `/workspaces/${wsC.id}`, C, { name: 'C doi ten' });
  check('8.2', '🔒 member SỬA workspace → 403', stCSuaWs === 403, `nhận ${stCSuaWs}`);

  const [stCXoaWs] = await api('DELETE', `/workspaces/${wsC.id}`, C);
  check('8.3', '🔒 member XOÁ workspace → 403', stCXoaWs === 403, `nhận ${stCXoaWs}`);

  const [stCTaoBoard] = await api('POST', '/boards', C, { workspaceId: wsC.id, name: 'C thu tao board' });
  check('8.4', '🔒 member TẠO board → 403', stCTaoBoard === 403, `nhận ${stCTaoBoard}`);

  const boardChung = (await api('POST', '/boards', A, { workspaceId: wsC.id, name: 'Board chung 2' }))[1];
  const [stCSuaBoard] = await api('PATCH', `/boards/${boardChung.id}`, C, { name: 'C doi ten board' });
  check('8.5', '🔒 member SỬA board → 403', stCSuaBoard === 403, `nhận ${stCSuaBoard}`);

  const [stCXoaBoard] = await api('DELETE', `/boards/${boardChung.id}`, C);
  check('8.6', '🔒 member XOÁ board → 403', stCXoaBoard === 403, `nhận ${stCXoaBoard}`);

  // ...nhưng VẪN LÀM VIỆC được bên trong board.
  const [stCTaoList, listC] = await api('POST', '/lists', C, { boardId: boardChung.id, name: 'C them cot' });
  check('8.7', 'member vẫn THÊM CỘT được', stCTaoList === 201, `nhận ${stCTaoList}`);

  const [stCTaoThe, theC] = await api('POST', '/cards', C, { listId: listC.id, title: 'C them the' });
  check('8.8', 'member vẫn THÊM THẺ được', stCTaoThe === 201, `nhận ${stCTaoThe}`);

  const [stCChat] = await api('POST', '/chat', C, { boardId: boardChung.id, content: 'C chat' });
  check('8.9', 'member vẫn CHAT được', stCChat === 201, `nhận ${stCChat}`);

  const [stCBinhLuan] = await api('POST', '/comments', C, { cardId: theC.id, content: 'C binh luan' });
  check('8.10', 'member vẫn BÌNH LUẬN được', stCBinhLuan === 201, `nhận ${stCBinhLuan}`);

  // admin (B) thì quản lý được
  const [stBTaoWs, wsB] = await api('POST', '/workspaces', B, { orgId: OID, name: 'B (admin) tao' });
  check('8.11', 'admin TẠO workspace → 201', stBTaoWs === 201, `nhận ${stBTaoWs}`);
  if (wsB?.id) await api('DELETE', `/workspaces/${wsB.id}`, B);

  // ------------------------------------- 9. THÔNG BÁO ĐƯỢC GIAO VIỆC
  section('9. THÔNG BÁO KHI ĐƯỢC GIAO PHỤ TRÁCH THẺ');

  bEvents.length = 0;
  const theGiao = (await api('POST', '/cards', A, { listId: listC.id, title: 'Thẻ giao cho B' }))[1];
  await api('PATCH', `/cards/${theGiao.id}`, A, { assigneeId: B_UID });
  await sleep(900);

  const evGiao = bEvents.find((e) => e.type === 'card.assigned');
  check('9.1', 'B nhận sự kiện "card.assigned"', !!evGiao,
    `B nhận ${bEvents.length} sự kiện: ${bEvents.map((e) => e.type).join(', ') || '(không có)'}`);
  check('9.2', 'kèm tên thẻ', evGiao?.data?.cardTitle === 'Thẻ giao cho B', JSON.stringify(evGiao?.data));
  check('9.3', 'kèm tên workspace (để ghép câu thông báo)', !!evGiao?.data?.workspaceName,
    JSON.stringify(evGiao?.data));
  check('9.4', 'kèm boardId + orgSlug (để bấm vào là điều hướng được)',
    !!evGiao?.data?.boardId && !!evGiao?.data?.orgSlug, JSON.stringify(evGiao?.data));
  check('9.5', 'kèm tên người giao', !!evGiao?.data?.byUserName, JSON.stringify(evGiao?.data));

  // Tự gán cho chính mình thì KHÔNG tự báo cho mình.
  const aEvents = [];
  const aSocket = io(BASE, { auth: { token: A }, transports: ['websocket'] });
  sockets.push(aSocket);
  aSocket.on('user:event', (e) => aEvents.push(e));
  await new Promise((res) => { aSocket.on('connect', res); setTimeout(res, 5000); });
  await api('PATCH', `/cards/${theGiao.id}`, A, { assigneeId: A_UID });
  await sleep(900);
  check('9.6', 'tự gán cho chính mình → KHÔNG tự báo', !aEvents.some((e) => e.type === 'card.assigned'),
    `A tự nhận ${aEvents.filter((e) => e.type === 'card.assigned').length} thông báo`);

  // Sửa trường khác (không đụng assignee) thì không bắn lại thông báo.
  bEvents.length = 0;
  await api('PATCH', `/cards/${theGiao.id}`, A, { title: 'Đổi mỗi tên thôi' });
  await sleep(900);
  check('9.7', 'sửa trường khác → không bắn lại thông báo giao việc',
    !bEvents.some((e) => e.type === 'card.assigned'),
    `nhận ${bEvents.filter((e) => e.type === 'card.assigned').length} thông báo thừa`);
} finally {
  await cleanup();
  console.log(`\n${Y}── Dọn dẹp ${'─'.repeat(48)}${RS}`);
  console.log(`  ${G}✔${RS} đã xoá tổ chức test`);
}

const total = pass.length + fail.length;
console.log(`\n${Y}${'═'.repeat(64)}${RS}`);
if (fail.length === 0) {
  console.log(`${G}KẾT QUẢ: ${total}/${total} ĐẠT.${RS}\n`);
} else {
  console.log(`${R}KẾT QUẢ: ${pass.length}/${total} đạt — ${fail.length} lỗi:${RS}`);
  for (const f of fail) console.log(`  ${R}✘${RS} ${f.code} ${f.desc}${f.why ? ` — ${f.why}` : ''}`);
  console.log();
}
process.exit(fail.length === 0 ? 0 : 1);
