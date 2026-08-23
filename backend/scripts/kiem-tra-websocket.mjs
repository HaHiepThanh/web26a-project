#!/usr/bin/env node
/**
 * Kiểm tra tự động lớp WebSocket (realtime theo board).
 *
 * CÁCH CHẠY:
 *     cd backend
 *     npm run start:dev                          # cửa sổ terminal thứ nhất
 *     node scripts/kiem-tra-websocket.mjs        # cửa sổ thứ hai
 *
 * Script tự dựng tổ chức/workspace/board riêng cho lần chạy này, mở kết nối
 * WebSocket thật, gọi REST rồi kiểm tra sự kiện có về đúng phòng không, cuối
 * cùng DỌN SẠCH.
 *
 * Phần quan trọng nhất là mục 2 (BẢO MẬT): người ngoài tổ chức KHÔNG được vào
 * phòng của board — thiếu chốt đó thì WebSocket trở thành đường vòng đọc trộm
 * toàn bộ chat và thay đổi thẻ của công ty khác.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ tiện ích

function readEnv(name) {
  // .env nằm ở GỐC dự án (ngang hàng backend/), không phải trong backend/ —
  // đúng như `envFilePath: ['../.env', '.env']` mà ConfigModule đang dùng.
  // Trước đây chỗ này chỉ tìm join(ROOT, '.env'): toàn bộ bài kiểm tra chạy
  // xong và pass hết, rồi mới ném ENOENT ngay ở bước dọn dẹp cuối cùng, khiến
  // dữ liệu test bị bỏ lại trong database và bảng kết quả không bao giờ in ra.
  const file = [join(ROOT, '..', '.env'), join(ROOT, '.env')].find((p) => existsSync(p));
  if (!file) return null;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
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
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

async function supabase(method, path, body) {
  const url = readEnv('SUPABASE_URL'), key = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/**
 * Mở 1 kết nối WebSocket và ghi lại MỌI sự kiện nhận được.
 *
 * Ghi hết vào mảng thay vì chờ từng cái một: sự kiện có thể về trước khi mình
 * kịp đăng ký lắng nghe, chờ kiểu "gọi REST xong mới listen" là thỉnh thoảng
 * trượt — test chập chờn còn tệ hơn không có test.
 */
function connect(token) {
  const socket = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false });
  const events = [];
  const presence = [];
  socket.on('board:event', (e) => events.push(e));
  socket.on('board:presence', (p) => presence.push(p));
  return { socket, events, presence };
}

const waitConnect = (c) =>
  new Promise((resolve) => {
    c.socket.on('connect', () => resolve('connected'));
    c.socket.on('disconnect', () => resolve('disconnected'));
    c.socket.on('connect_error', () => resolve('error'));
    setTimeout(() => resolve('timeout'), 5000);
  });

const joinBoard = (c, boardId) =>
  new Promise((resolve) => {
    c.socket.timeout(5000).emit('board:join', { boardId }, (err, res) =>
      resolve(err ? { ok: false, error: 'timeout' } : res),
    );
  });

const leaveBoard = (c, boardId) =>
  new Promise((resolve) => {
    c.socket.timeout(5000).emit('board:leave', { boardId }, (err, res) => resolve(err ? {} : res));
  });

/** Chờ tới khi có sự kiện đúng `type` trong mảng đã ghi, tối đa `ms`. */
async function waitEvent(c, type, ms = 4000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const hit = c.events.find((e) => e.type === type);
    if (hit) return hit;
    await sleep(60);
  }
  return null;
}

// ------------------------------------------------------------------ chuẩn bị

console.log(`\n${Y}KIỂM TRA WEBSOCKET — realtime theo board${RS}`);
console.log(`${DIM}${BASE}${RS}\n`);

if (!API_KEY || (await api('GET', '/health'))[0] !== 200) {
  console.log(`${R}Thiếu firebaseApiKey hoặc backend chưa chạy.${RS}\n`);
  process.exit(1);
}
console.log(`${G}✔${RS} Backend đang chạy`);

for (const e of ['hocvien-a@test.dev', 'kiemtra-b@test.dev']) await firebase('signUp', e);
const ra = await firebase('signInWithPassword', 'hocvien-a@test.dev');
const rb = await firebase('signInWithPassword', 'kiemtra-b@test.dev');
const A = ra.idToken, B = rb.idToken;
await api('GET', '/auth/me', A);
await api('GET', '/auth/me', B);
console.log(`${G}✔${RS} A (chủ tổ chức) · B (người ngoài)`);

const STAMP = Date.now();
const OID = (await api('POST', '/organizations', A, { name: 'KT WS', slug: `kt-ws-${STAMP}` }))[1].id;
const WID = (await api('POST', '/workspaces', A, { orgId: OID, name: 'WS' }))[1].id;
const BID = (await api('POST', '/boards', A, { workspaceId: WID, name: 'Board WS' }))[1].id;
const L1 = (await api('POST', '/lists', A, { boardId: BID, name: 'Cần làm' }))[1].id;
const L2 = (await api('POST', '/lists', A, { boardId: BID, name: 'Đang làm' }))[1].id;

const OID_B = (await api('POST', '/organizations', B, { name: 'KT WS B', slug: `kt-ws-b-${STAMP}` }))[1].id;
console.log(`${G}✔${RS} Đã dựng board test\n`);

const sockets = [];
async function cleanup() {
  for (const c of sockets) c.socket.close();
  await supabase('DELETE', `organizations?id=eq.${OID}`);
  await supabase('DELETE', `organizations?id=eq.${OID_B}`);
}

try {
  // ---------------------------------------------------------------- 1. KẾT NỐI
  section('1. XÁC THỰC LÚC BẮT TAY');

  const noToken = connect(undefined); sockets.push(noToken);
  check('1.1', 'không gửi token → bị ngắt kết nối',
    (await waitConnect(noToken)) !== 'connected' || (await sleep(400), !noToken.socket.connected),
    'socket không có token vẫn đứng vững — ai cũng nghe được');

  const badToken = connect('day.la.token.bia'); sockets.push(badToken);
  check('1.2', 'token bịa → bị ngắt kết nối',
    (await waitConnect(badToken)) !== 'connected' || (await sleep(400), !badToken.socket.connected),
    'token sai vẫn kết nối được — chữ ký không được kiểm');

  const a1 = connect(A); sockets.push(a1);
  check('1.3', 'token hợp lệ → kết nối được', (await waitConnect(a1)) === 'connected');

  const b1 = connect(B); sockets.push(b1);
  check('1.4', 'B cũng kết nối được (B có tài khoản thật)', (await waitConnect(b1)) === 'connected');

  // ---------------------------------------------------------------- 2. BẢO MẬT
  section('2. 🔒 VÀO PHÒNG — CHỐT QUAN TRỌNG NHẤT');

  const joinA = await joinBoard(a1, BID);
  check('2.1', 'A vào board của A → được', joinA?.ok === true, JSON.stringify(joinA));

  const joinB = await joinBoard(b1, BID);
  check('2.2', '🔒 B (ngoài tổ chức) vào board của A → BỊ TỪ CHỐI', joinB?.ok === false,
    'B vào được phòng board của A — nghe trộm được toàn bộ chat và thay đổi thẻ');

  const joinFake = await joinBoard(a1, '00000000-0000-4000-8000-000000000999');
  check('2.3', 'boardId không tồn tại → bị từ chối', joinFake?.ok === false, JSON.stringify(joinFake));

  const joinBad = await joinBoard(a1, 'khong-phai-uuid');
  check('2.4', 'boardId sai định dạng → bị từ chối (không phải 500)', joinBad?.ok === false, JSON.stringify(joinBad));

  const joinEmpty = await joinBoard(a1, '');
  check('2.5', 'thiếu boardId → bị từ chối', joinEmpty?.ok === false, JSON.stringify(joinEmpty));

  // ---------------------------------------------------------------- 3. PRESENCE
  section('3. AI ĐANG MỞ BOARD (PRESENCE)');

  await sleep(300);
  const p1 = a1.presence.at(-1);
  check('3.1', 'A nhận được danh sách người đang xem', !!p1, 'không có sự kiện board:presence nào');
  check('3.2', 'đúng 1 người đang xem', p1?.viewers?.length === 1, `nhận ${p1?.viewers?.length}`);
  check('3.3', 'có kèm tên hiển thị', p1?.viewers?.[0] && 'displayName' in p1.viewers[0],
    JSON.stringify(p1?.viewers?.[0]));

  // Cùng một người mở 2 tab → vẫn phải đếm là 1 người.
  const a2 = connect(A); sockets.push(a2);
  await waitConnect(a2);
  await joinBoard(a2, BID);
  await sleep(400);
  const p2 = a1.presence.at(-1);
  check('3.4', 'cùng 1 người mở 2 tab vẫn đếm là 1', p2?.viewers?.length === 1,
    `nhận ${p2?.viewers?.length} người cho 2 tab của cùng A`);

  // ------------------------------------------------------- 4. SỰ KIỆN DỮ LIỆU
  section('4. THAY ĐỔI QUA REST → SỰ KIỆN VỀ WEBSOCKET');

  a1.events.length = 0;
  b1.events.length = 0;

  const L3 = (await api('POST', '/lists', A, { boardId: BID, name: 'Xong' }))[1];
  const evList = await waitEvent(a1, 'list.created');
  check('4.1', 'tạo cột → nhận "list.created"', !!evList, 'không nhận được sự kiện nào');
  check('4.2', 'kèm đúng dữ liệu cột vừa tạo', evList?.data?.id === L3.id && evList?.data?.name === 'Xong',
    JSON.stringify(evList?.data));
  check('4.3', 'kèm actorId để biết ai làm', !!evList?.actorId, JSON.stringify(evList));
  check('4.4', 'kèm boardId', evList?.boardId === BID, evList?.boardId);

  const card = (await api('POST', '/cards', A, { listId: L1, title: 'Thẻ realtime' }))[1];
  check('4.5', 'tạo thẻ → nhận "card.created"', !!(await waitEvent(a1, 'card.created')));
  check('4.6', 'tạo thẻ cũng sinh "activity.created"', !!(await waitEvent(a1, 'activity.created')));

  await api('PATCH', `/cards/${card.id}`, A, { priority: 'high' });
  const evUpd = await waitEvent(a1, 'card.updated');
  check('4.7', 'sửa thẻ → nhận "card.updated"', evUpd?.data?.priority === 'high', JSON.stringify(evUpd?.data));

  await api('PATCH', `/cards/${card.id}/move`, A, { toListId: L2, position: 1 });
  const evMove = await waitEvent(a1, 'card.moved');
  check('4.8', 'kéo thẻ → nhận "card.moved" kèm cột mới', evMove?.data?.listId === L2, JSON.stringify(evMove?.data));

  await api('POST', '/chat', A, { boardId: BID, content: 'Chào realtime' });
  const evChat = await waitEvent(a1, 'chat.message');
  check('4.9', 'gửi chat → nhận "chat.message"', evChat?.data?.content === 'Chào realtime', JSON.stringify(evChat?.data));
  check('4.10', 'tin chat kèm userId (để căn trái/phải)', !!evChat?.data?.userId, JSON.stringify(evChat?.data));

  await api('POST', '/comments', A, { cardId: card.id, content: 'Bình luận realtime' });
  check('4.11', 'bình luận → nhận "comment.created"', !!(await waitEvent(a1, 'comment.created')));

  const lb = (await api('POST', '/labels', A, { boardId: BID, name: 'Gấp', color: '#ff0000' }))[1];
  check('4.12', 'tạo nhãn → nhận "label.created"', !!(await waitEvent(a1, 'label.created')));
  await api('POST', `/labels/cards/${card.id}/${lb.id}`, A, {});
  check('4.13', 'gắn nhãn → nhận "label.attached"', !!(await waitEvent(a1, 'label.attached')));
  await api('DELETE', `/labels/cards/${card.id}/${lb.id}`, A);
  check('4.14', 'gỡ nhãn → nhận "label.detached"', !!(await waitEvent(a1, 'label.detached')));

  await api('PATCH', `/boards/${BID}`, A, { name: 'Board đã đổi tên' });
  const evBoard = await waitEvent(a1, 'board.updated');
  check('4.15', 'đổi tên board → nhận "board.updated"', evBoard?.data?.name === 'Board đã đổi tên',
    JSON.stringify(evBoard?.data));

  await api('DELETE', `/cards/${card.id}`, A);
  const evDel = await waitEvent(a1, 'card.deleted');
  check('4.16', 'xoá thẻ → nhận "card.deleted" kèm id', evDel?.data?.id === card.id, JSON.stringify(evDel?.data));

  await api('DELETE', `/lists/${L3.id}`, A);
  check('4.17', 'xoá cột → nhận "list.deleted"', !!(await waitEvent(a1, 'list.deleted')));

  // -------------------------------------------------- 5. KHÔNG RÒ SANG NGƯỜI KHÁC
  section('5. 🔒 SỰ KIỆN KHÔNG ĐƯỢC RÒ RA NGOÀI PHÒNG');

  check('5.1', '🔒 B không nhận bất kỳ sự kiện nào của board A', b1.events.length === 0,
    `B nhận được ${b1.events.length} sự kiện: ${b1.events.map((e) => e.type).join(', ')}`);

  // Tab thứ hai của CHÍNH A thì phải nhận — người dùng mở 2 cửa sổ vẫn phải đồng bộ.
  check('5.2', 'tab thứ hai của A vẫn nhận được sự kiện', a2.events.length > 0,
    'tab 2 của cùng một người không nhận được gì');

  // ---------------------------------------------------------------- 6. RỜI PHÒNG
  section('6. RỜI PHÒNG');

  a2.socket.close();
  await sleep(500);
  const p3 = a1.presence.at(-1);
  check('6.1', 'đóng tab → presence phát lại', !!p3);

  await leaveBoard(a1, BID);
  a1.events.length = 0;
  await api('POST', '/lists', A, { boardId: BID, name: 'Sau khi rời' });
  await sleep(800);
  check('6.2', 'rời phòng rồi thì không nhận sự kiện nữa', a1.events.length === 0,
    `vẫn nhận ${a1.events.length} sự kiện sau khi rời`);
} finally {
  await cleanup();
  console.log(`\n${Y}── Dọn dẹp ${'─'.repeat(48)}${RS}`);
  console.log(`  ${G}✔${RS} đã xoá 2 tổ chức test`);
}

const total = pass.length + fail.length;
console.log(`\n${Y}${'═'.repeat(64)}${RS}`);
if (fail.length === 0) {
  console.log(`${G}KẾT QUẢ: ${total}/${total} ĐẠT — WebSocket hoạt động đúng.${RS}\n`);
} else {
  console.log(`${R}KẾT QUẢ: ${pass.length}/${total} đạt — ${fail.length} lỗi:${RS}`);
  for (const f of fail) console.log(`  ${R}✘${RS} ${f.code} ${f.desc}${f.why ? ` — ${f.why}` : ''}`);
  console.log();
}
process.exit(fail.length === 0 ? 0 : 1);
