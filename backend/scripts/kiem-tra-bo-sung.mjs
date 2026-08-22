#!/usr/bin/env node
/**
 * Kiểm tra tự động phần backend bổ sung: checklist, đính kèm (Supabase Storage),
 * sao / bộ lọc / nhóm highlight, thống kê, và 4 endpoint lẻ.
 *
 * CÁCH CHẠY:
 *     cd backend
 *     npm run start:dev                    # cửa sổ 1
 *     node scripts/kiem-tra-bo-sung.mjs    # cửa sổ 2
 *
 * Kịch bản: A là chủ tổ chức, B là admin, D là người NGOÀI tổ chức.
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
  return [r.status, text ? JSON.parse(text) : null];
}
/** Gửi multipart — KHÔNG tự đặt Content-Type, để fetch tự sinh boundary. */
async function upload(path, token, cardId, filename, bytes, mime) {
  const form = new FormData();
  form.append('cardId', cardId);
  form.append('file', new Blob([bytes], { type: mime }), filename);
  const r = await fetch(BASE + path, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const text = await r.text();
  return [r.status, text ? JSON.parse(text) : null];
}
async function supabase(method, path) {
  const url = readEnv('SUPABASE_URL'), key = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  await fetch(`${url}/rest/v1/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}` } });
}

console.log(`\n${Y}KIỂM TRA BACKEND BỔ SUNG — checklist · đính kèm · sao/lọc · thống kê${RS}`);
console.log(`${DIM}${BASE}${RS}\n`);

if (!API_KEY || (await api('GET', '/health'))[0] !== 200) {
  console.log(`${R}Thiếu firebaseApiKey hoặc backend chưa chạy.${RS}\n`);
  process.exit(1);
}

const EMAILS = ['hocvien-a@test.dev', 'kiemtra-b@test.dev', 'kiemtra-d@test.dev'];
for (const e of EMAILS) await firebase('signUp', e);
const [ra, rb, rd] = await Promise.all(EMAILS.map((e) => firebase('signInWithPassword', e)));
const A = ra.idToken, B = rb.idToken, D = rd.idToken;
const A_UID = ra.localId, B_UID = rb.localId, D_UID = rd.localId;
for (const t of [A, B, D]) await api('GET', '/auth/me', t);
console.log(`${G}✔${RS} A (chủ) · B (admin) · D (người ngoài)`);

const STAMP = Date.now();
const OID = (await api('POST', '/organizations', A, { name: 'KT Bổ sung', slug: `kt-bs-${STAMP}` }))[1].id;
const inv = (await api('POST', `/organizations/${OID}/invites`, A, { toUserId: B_UID, role: 'admin' }))[1];
await api('PATCH', `/organizations/invites/${inv.id}`, B, { accept: true });

const WID = (await api('POST', '/workspaces', A, { orgId: OID, name: 'WS' }))[1].id;
const BID = (await api('POST', '/boards', A, { workspaceId: WID, name: 'Board KT' }))[1].id;
const LID = (await api('POST', '/lists', A, { boardId: BID, name: 'Cột' }))[1].id;
const CID = (await api('POST', '/cards', A, { listId: LID, title: 'Thẻ KT' }))[1].id;

// Tổ chức riêng của D — để D có dữ liệu của chính mình
const OID_D = (await api('POST', '/organizations', D, { name: 'KT D', slug: `kt-bs-d-${STAMP}` }))[1].id;
console.log(`${G}✔${RS} Đã dựng tổ chức / board / thẻ test\n`);

async function cleanup() {
  await supabase('DELETE', `organizations?id=eq.${OID}`);
  await supabase('DELETE', `organizations?id=eq.${OID_D}`);
}

try {
  // ------------------------------------------------------------ 1. CHECKLIST
  section('1. CHECKLIST TRONG THẺ');

  const [st1, it1] = await api('POST', '/checklist', A, { cardId: CID, content: 'Việc 1' });
  check('1.1', 'thêm mục checklist → 201', st1 === 201, `nhận ${st1}: ${JSON.stringify(it1)}`);
  check('1.2', 'trả camelCase (isDone, cardId)', it1 && 'isDone' in it1 && 'cardId' in it1, JSON.stringify(it1));

  const [, it2] = await api('POST', '/checklist', A, { cardId: CID, content: 'Việc 2' });
  check('1.3', 'mục thứ hai có position lớn hơn', it2?.position > it1?.position,
    `${it1?.position} → ${it2?.position}`);

  const [stEmpty] = await api('POST', '/checklist', A, { cardId: CID, content: '   ' });
  check('1.4', 'nội dung rỗng → 400', stEmpty === 400, `nhận ${stEmpty}`);

  const [stNope] = await api('POST', '/checklist', A, { cardId: '00000000-0000-4000-8000-000000000999', content: 'x' });
  check('1.5', 'cardId không tồn tại → 404', stNope === 404, `nhận ${stNope}`);

  const [stTick, ticked] = await api('PATCH', `/checklist/${it1.id}`, A, { isDone: true });
  check('1.6', 'tick xong → isDone = true', stTick === 200 && ticked?.isDone === true, JSON.stringify(ticked));

  const [stList, items] = await api('GET', `/checklist?cardId=${CID}`, A);
  check('1.7', 'đọc danh sách → 2 mục, sắp theo position', stList === 200 && items?.length === 2
    && items[0].position <= items[1].position, JSON.stringify(items?.map((i) => i.content)));

  check('1.8', 'B (cùng tổ chức) đọc được', (await api('GET', `/checklist?cardId=${CID}`, B))[0] === 200);
  check('1.9', '🔒 D (ngoài tổ chức) đọc → 404', (await api('GET', `/checklist?cardId=${CID}`, D))[0] === 404);
  check('1.10', '🔒 D thêm mục vào thẻ của A → 404', (await api('POST', '/checklist', D, { cardId: CID, content: 'trộm' }))[0] === 404);
  check('1.11', '🔒 D tick mục của A → 404', (await api('PATCH', `/checklist/${it1.id}`, D, { isDone: false }))[0] === 404);
  check('1.12', '🔒 D xoá mục của A → 404', (await api('DELETE', `/checklist/${it1.id}`, D))[0] === 404);

  check('1.13', 'xoá mục → 200', (await api('DELETE', `/checklist/${it2.id}`, A))[0] === 200);
  check('1.14', 'xoá lần 2 → 404', (await api('DELETE', `/checklist/${it2.id}`, A))[0] === 404);

  // ----------------------------------------------------------- 2. ĐÍNH KÈM
  section('2. ĐÍNH KÈM (SUPABASE STORAGE)');

  // PNG 1x1 hợp lệ
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const [stUp, att] = await upload('/attachments', A, CID, 'anh-test.png', PNG, 'image/png');
  check('2.1', 'tải ảnh lên → 201', stUp === 201, `nhận ${stUp}: ${JSON.stringify(att)}`);
  check('2.2', 'nhận diện là ảnh (isImage)', att?.isImage === true, JSON.stringify(att));
  check('2.3', 'lưu đúng tên gốc', att?.name === 'anh-test.png', att?.name);
  check('2.4', 'trả link tải có chữ ký', typeof att?.url === 'string' && att.url.includes('token='),
    String(att?.url).slice(0, 80));
  check('2.5', 'KHÔNG lộ storage_path ra ngoài', att && !('storagePath' in att) && !('storage_path' in att),
    Object.keys(att ?? {}).join(', '));

  // Link ký phải tải được thật
  if (att?.url) {
    const r = await fetch(att.url);
    const buf = Buffer.from(await r.arrayBuffer());
    check('2.6', 'link ký tải được đúng nội dung tệp', r.ok && buf.equals(PNG),
      `status=${r.status} bytes=${buf.length}/${PNG.length}`);
  } else {
    check('2.6', 'link ký tải được đúng nội dung tệp', false, 'không có url');
  }

  const [stTxt, txtAtt] = await upload('/attachments', A, CID, 'ghi-chu.txt', Buffer.from('xin chao'), 'text/plain');
  check('2.7', 'tải tệp không phải ảnh → 201, isImage = false',
    stTxt === 201 && txtAtt?.isImage === false, `${stTxt} ${JSON.stringify(txtAtt?.isImage)}`);

  const [stCover, covered] = await api('PATCH', `/attachments/${att.id}/cover`, A, { isCover: true });
  check('2.8', 'đặt ảnh bìa → 200', stCover === 200 && covered?.isCover === true, JSON.stringify(covered));

  const [stCoverTxt] = await api('PATCH', `/attachments/${txtAtt.id}/cover`, A, { isCover: true });
  check('2.9', 'đặt tệp .txt làm ảnh bìa → 400', stCoverTxt === 400, `nhận ${stCoverTxt}`);

  const [, dsAtt] = await api('GET', `/attachments?cardId=${CID}`, A);
  check('2.10', 'liệt kê ra 2 tệp', dsAtt?.length === 2, `nhận ${dsAtt?.length}`);
  check('2.11', 'chỉ MỘT tệp là ảnh bìa', dsAtt?.filter((a) => a.isCover).length === 1,
    `nhận ${dsAtt?.filter((a) => a.isCover).length}`);

  check('2.12', '🔒 D liệt kê đính kèm của A → 404', (await api('GET', `/attachments?cardId=${CID}`, D))[0] === 404);
  check('2.13', '🔒 D tải tệp lên thẻ của A → 404', (await upload('/attachments', D, CID, 'x.png', PNG, 'image/png'))[0] === 404);
  check('2.14', '🔒 D xoá đính kèm của A → 404', (await api('DELETE', `/attachments/${att.id}`, D))[0] === 404);

  const storagePathCuaTxt = await (async () => {
    const url = readEnv('SUPABASE_URL'), key = readEnv('SUPABASE_SERVICE_ROLE_KEY');
    const r = await fetch(`${url}/rest/v1/card_attachments?select=storage_path&id=eq.${txtAtt.id}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    return (await r.json())[0]?.storage_path;
  })();

  check('2.15', 'xoá đính kèm → 200', (await api('DELETE', `/attachments/${txtAtt.id}`, A))[0] === 200);
  // File phải biến mất khỏi Storage, không để lại rác
  {
    const url = readEnv('SUPABASE_URL'), key = readEnv('SUPABASE_SERVICE_ROLE_KEY');
    const r = await fetch(`${url}/storage/v1/object/card-attachments/${storagePathCuaTxt}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    check('2.16', 'xoá dòng thì file trong Storage cũng mất', r.status === 400 || r.status === 404,
      `Storage vẫn trả ${r.status}`);
  }

  // ------------------------------------------------- 3. SAO / LỌC / HIGHLIGHT
  section('3. TUỲ CHỌN RIÊNG TỪNG NGƯỜI');

  check('3.1', 'gắn sao → 200', (await api('POST', `/stars/${BID}`, A, {}))[0] === 200);
  check('3.2', 'gắn sao lần 2 không vỡ', (await api('POST', `/stars/${BID}`, A, {}))[0] === 200);
  check('3.3', 'A thấy board đã gắn sao', ((await api('GET', '/stars', A))[1] ?? []).includes(BID));
  check('3.4', '🔒 B KHÔNG thấy sao của A (dữ liệu riêng)', !((await api('GET', '/stars', B))[1] ?? []).includes(BID),
    JSON.stringify((await api('GET', '/stars', B))[1]));
  check('3.5', '🔒 D gắn sao board của A → 404', (await api('POST', `/stars/${BID}`, D, {}))[0] === 404);
  check('3.6', 'bỏ sao → danh sách rỗng', (await api('DELETE', `/stars/${BID}`, A))[0] === 200
    && !((await api('GET', '/stars', A))[1] ?? []).includes(BID));

  const [stF, filter] = await api('POST', '/saved-filters', A, {
    boardId: BID, name: 'Việc gấp của tôi', assigneeIds: [A_UID], priorities: ['high'], dateFilter: 'overdue',
  });
  check('3.7', 'lưu bộ lọc → 201', stF === 201, `nhận ${stF}: ${JSON.stringify(filter)}`);
  check('3.8', 'giữ nguyên assigneeIds là uid (không phải uuid)',
    filter?.assigneeIds?.[0] === A_UID, JSON.stringify(filter?.assigneeIds));

  check('3.9', 'A thấy bộ lọc của mình', ((await api('GET', `/saved-filters?boardId=${BID}`, A))[1] ?? []).length === 1);
  check('3.10', '🔒 B KHÔNG thấy bộ lọc của A', ((await api('GET', `/saved-filters?boardId=${BID}`, B))[1] ?? []).length === 0,
    JSON.stringify((await api('GET', `/saved-filters?boardId=${BID}`, B))[1]));
  check('3.11', '🔒 B xoá bộ lọc của A → 404', (await api('DELETE', `/saved-filters/${filter.id}`, B))[0] === 404);
  check('3.12', 'A tự xoá bộ lọc của mình → 200', (await api('DELETE', `/saved-filters/${filter.id}`, A))[0] === 200);

  const [stG, group] = await api('POST', '/highlight-groups', A, { boardId: BID, name: 'Nhóm A', cardIds: [CID] });
  check('3.13', 'lưu nhóm highlight → 201', stG === 201, `nhận ${stG}: ${JSON.stringify(group)}`);
  check('3.14', '🔒 B không thấy nhóm của A', ((await api('GET', `/highlight-groups?boardId=${BID}`, B))[1] ?? []).length === 0);
  check('3.15', '🔒 B xoá nhóm của A → 404', (await api('DELETE', `/highlight-groups/${group.id}`, B))[0] === 404);

  // ------------------------------------------------------------ 4. THỐNG KÊ
  section('4. THỐNG KÊ BOARD');

  const [stS, stats] = await api('GET', `/stats/boards/${BID}`, A);
  check('4.1', 'đọc thống kê → 200', stS === 200, `nhận ${stS}`);
  check('4.2', 'có đủ 3 khối', stats && 'overview' in stats && 'memberWorkload' in stats && 'overdueCards' in stats,
    Object.keys(stats ?? {}).join(', '));
  check('4.3', 'overview đếm đúng số thẻ', stats?.overview?.totalCards >= 1, JSON.stringify(stats?.overview));
  check('4.4', 'trả camelCase', stats?.overview && 'totalCards' in stats.overview && !('total_cards' in stats.overview),
    Object.keys(stats?.overview ?? {}).join(', '));
  check('4.5', '🔒 D đọc thống kê board của A → 404', (await api('GET', `/stats/boards/${BID}`, D))[0] === 404);

  // ------------------------------------------------------ 5. ENDPOINT LẺ
  section('5. ĐỔI TÊN TỔ CHỨC · LỜI MỜI ĐÃ GỬI · NỀN BOARD');

  const [stR, renamed] = await api('PATCH', `/organizations/${OID}`, A, { name: 'Tên mới' });
  check('5.1', 'đổi tên tổ chức → 200', stR === 200 && renamed?.name === 'Tên mới', JSON.stringify(renamed));
  check('5.2', 'slug KHÔNG đổi theo', !!renamed?.slug && renamed.slug === `kt-bs-${STAMP}`, renamed?.slug);
  check('5.3', 'tên rỗng → 400', (await api('PATCH', `/organizations/${OID}`, A, { name: '  ' }))[0] === 400);
  check('5.4', '🔒 D đổi tên tổ chức của A → 403/404',
    [403, 404].includes((await api('PATCH', `/organizations/${OID}`, D, { name: 'hack' }))[0]));

  const inv2 = (await api('POST', `/organizations/${OID}/invites`, A, { toUserId: D_UID, role: 'member' }))[1];
  const [stP, pending] = await api('GET', `/organizations/${OID}/invites`, A);
  check('5.5', 'xem lời mời đã gửi → 200', stP === 200 && pending?.length === 1, `nhận ${stP}, ${pending?.length} lời mời`);
  check('5.6', 'kèm email người được mời (không chỉ uid)', !!pending?.[0]?.toUser?.email, JSON.stringify(pending?.[0]?.toUser));
  check('5.7', 'kèm quyền sẽ nhận', pending?.[0]?.role === 'member', pending?.[0]?.role);
  check('5.8', '🔒 D xem lời mời của tổ chức A → 403/404',
    [403, 404].includes((await api('GET', `/organizations/${OID}/invites`, D))[0]));

  check('5.9', 'huỷ lời mời → 200', (await api('DELETE', `/organizations/invites/${inv2.id}`, A))[0] === 200);
  check('5.10', 'huỷ xong danh sách rỗng', ((await api('GET', `/organizations/${OID}/invites`, A))[1] ?? []).length === 0);
  check('5.11', 'huỷ lần 2 → 404', (await api('DELETE', `/organizations/invites/${inv2.id}`, A))[0] === 404);
  check('5.12', 'huỷ lời mời ĐÃ được đồng ý → 409', (await api('DELETE', `/organizations/invites/${inv.id}`, A))[0] === 409);

  const [stBg, boardBg] = await api('PATCH', `/boards/${BID}`, A, {
    background: 'bg-board-green', backgroundImagePath: 'anh/nen.jpg',
  });
  check('5.13', 'lưu được màu nền board → 200', stBg === 200 && boardBg?.background === 'bg-board-green',
    JSON.stringify({ st: stBg, bg: boardBg?.background }));
  check('5.14', 'lưu được đường dẫn ảnh nền', boardBg?.backgroundImagePath === 'anh/nen.jpg', boardBg?.backgroundImagePath);

  const [, doc] = await api('GET', `/boards/${BID}`, A);
  check('5.15', 'đọc lại vẫn còn (đã xuống database, không phải localStorage)',
    doc?.background === 'bg-board-green' && doc?.backgroundImagePath === 'anh/nen.jpg', JSON.stringify(doc));

  check('5.16', 'gỡ nền về mặc định bằng null',
    (await api('PATCH', `/boards/${BID}`, A, { background: null }))[1]?.background === null);
} finally {
  await cleanup();
  console.log(`\n${Y}── Dọn dẹp ${'─'.repeat(48)}${RS}`);
  console.log(`  ${G}✔${RS} đã xoá 2 tổ chức test`);
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
