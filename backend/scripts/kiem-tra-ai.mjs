#!/usr/bin/env node
/**
 * Kiểm tra tự động phần AI gợi ý tạo thẻ từ chat (Gemini).
 *
 * CÁCH CHẠY:
 *     cd backend
 *     npm run start:dev                     # cửa sổ 1
 *     npm run kiem-tra:ai                   # cửa sổ 2
 *     npm run kiem-tra:ai -- --skip-llm     # bỏ qua phần gọi model thật
 *
 * ⚠️ Cần chạy migrations/0004_goi_y_tao_the.sql trước.
 *
 * Phần gọi LLM KHÔNG tất định. Cách xử lý: chỉ khẳng định những thứ bắt buộc
 * phải đúng (số thẻ, ai phụ trách, ngày hạn) và so tên thẻ kiểu CHỨA thay vì so
 * bằng. Nếu một phép thử chập chờn qua nhiều lần chạy thì siết prompt, KHÔNG nới
 * lỏng phép thử cho qua.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const BO_QUA_LLM = process.argv.includes('--skip-llm');
const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', DIM = '\x1b[2m', RS = '\x1b[0m';

const pass = [], fail = [];
function check(code, desc, ok, why = '') {
  (ok ? pass : fail).push({ code, desc, why });
  console.log(`  ${ok ? G + '✔' + RS : R + '✘' + RS} ${code.padEnd(6)} ${desc}`);
  if (!ok && why) console.log(`      ${R}→ ${why}${RS}`);
}
const section = (t) => console.log(`\n${Y}── ${t} ${'─'.repeat(Math.max(0, 54 - t.length))}${RS}`);
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
  const r = await fetch(`${url}/rest/v1/${path}`, {
    method, headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=representation' },
  });
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

/** Gửi tin nhắn rồi CHỜ gợi ý xuất hiện (phân tích chạy nền, không đồng bộ). */
async function nhanTinRoiCho(token, boardId, content, msToiDa = 25_000) {
  const t0 = Date.now();
  const [, msg] = await api('POST', '/chat', token, { boardId, content });
  const doTre = Date.now() - t0;

  const deadline = Date.now() + msToiDa;
  while (Date.now() < deadline) {
    const rows = await supabase('GET', `chat_task_suggestions?select=*&message_id=eq.${msg.id}`);
    if (rows?.length) return { msg, goiY: rows[0], doTreGuiTin: doTre };
    await sleep(700);
  }
  return { msg, goiY: null, doTreGuiTin: doTre };
}

const coDau = (s) =>
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(s);

console.log(`\n${Y}KIỂM TRA AI GỢI Ý TẠO THẺ — Gemini${RS}`);
console.log(`${DIM}${BASE}${BO_QUA_LLM ? ' · BỎ QUA phần gọi model' : ''}${RS}\n`);

if (!API_KEY || (await api('GET', '/health'))[0] !== 200) {
  console.log(`${R}Thiếu firebaseApiKey hoặc backend chưa chạy.${RS}\n`);
  process.exit(1);
}
{
  const url = readEnv('SUPABASE_URL'), key = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${url}/rest/v1/chat_task_suggestions?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) {
    console.log(`${R}Chưa chạy migrations/0004_goi_y_tao_the.sql.${RS}\n`);
    process.exit(1);
  }
}
console.log(`${G}✔${RS} Backend đang chạy, migration 0004 đã áp dụng`);

const EMAILS = ['hocvien-a@test.dev', 'kiemtra-b@test.dev', 'kiemtra-d@test.dev'];
for (const e of EMAILS) await firebase('signUp', e);
const [ra, rb, rd] = await Promise.all(EMAILS.map((e) => firebase('signInWithPassword', e)));
const A = ra.idToken, B = rb.idToken, D = rd.idToken;
const A_UID = ra.localId, B_UID = rb.localId;
for (const t of [A, B, D]) await api('GET', '/auth/me', t);

// Đặt tên hiển thị đúng như kịch bản để model có cái mà bám vào ("Ê Hoà").
//
// ⚠️ Nhớ TÊN CŨ để trả lại lúc dọn dẹp. Đây là tài khoản test dùng chung với các
//    bộ kiểm tra khác và với việc bấm tay trên trình duyệt — đổi tên rồi bỏ đó
//    thì lần sau mở app lên thấy "Huy"/"Hoà" không hiểu ở đâu ra.
const tenCu = {
  A: (await api('GET', '/auth/me', A))[1]?.user?.displayName ?? null,
  B: (await api('GET', '/auth/me', B))[1]?.user?.displayName ?? null,
};
await api('PATCH', '/auth/profile', A, { displayName: 'Huy' });
await api('PATCH', '/auth/profile', B, { displayName: 'Hoà' });

const STAMP = Date.now();
const OID = (await api('POST', '/organizations', A, { name: 'KT AI', slug: `kt-ai-${STAMP}` }))[1].id;
const inv = (await api('POST', `/organizations/${OID}/invites`, A, { toUserId: B_UID, role: 'member' }))[1];
await api('PATCH', `/organizations/invites/${inv.id}`, B, { accept: true });

const WID = (await api('POST', '/workspaces', A, { orgId: OID, name: 'WS' }))[1].id;
const BID = (await api('POST', '/boards', A, { workspaceId: WID, name: 'Board AI' }))[1].id;
const L1 = (await api('POST', '/lists', A, { boardId: BID, name: 'Việc cần làm' }))[1].id;
await api('POST', '/lists', A, { boardId: BID, name: 'Đang làm' });

const OID_D = (await api('POST', '/organizations', D, { name: 'KT AI D', slug: `kt-ai-d-${STAMP}` }))[1].id;
const homNay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
console.log(`${G}✔${RS} Huy (gửi) · Hoà (nhận) · D (người ngoài) — hôm nay ${homNay}\n`);

const sockets = [];
async function cleanup() {
  for (const s of sockets) s.close();
  await supabase('DELETE', `organizations?id=eq.${OID}`);
  await supabase('DELETE', `organizations?id=eq.${OID_D}`);
  // Trả lại tên hiển thị như trước khi chạy test.
  await api('PATCH', '/auth/profile', A, { displayName: tenCu.A ?? '' });
  await api('PATCH', '/auth/profile', B, { displayName: tenCu.B ?? '' });
}

try {
  section('1. BỘ LỌC RẺ — không tốn lượt gọi model');

  for (const [ma, tin] of [['1.1', 'ok'], ['1.2', 'ừ'], ['1.3', 'lol']]) {
    const { goiY } = await nhanTinRoiCho(A, BID, tin, 3500);
    check(ma, `"${tin}" → không sinh gợi ý`, goiY === null, 'lại gọi model cho tin vô nghĩa');
  }
  {
    const { goiY } = await nhanTinRoiCho(A, BID, 'Mình vừa push xong phần header rồi nhé cả nhà', 6000);
    check('1.4', 'báo việc ĐÃ xong → không sinh gợi ý', goiY === null, JSON.stringify(goiY?.cards));
  }

  // ── Giao việc KHÔNG kèm mốc thời gian ───────────────────────────────────
  //
  // Bản đầu của bộ lọc bắt buộc ≥2 trong 3 dấu hiệu (động từ · thời gian ·
  // nhắc tên), nên những câu dưới đây bị chặn thẳng — model không hề được gọi:
  //
  //   "Hoà ơi, lên tiếp kế hoạch phân quyền nha."
  //     có tên, KHÔNG có thời gian, và "lên kế hoạch" không nằm trong danh
  //     sách động từ → 1/3 → bỏ qua.
  //
  // Giờ luật là: gọi ĐÍCH DANH đồng đội thì đủ một mình. Bốn phép thử này giữ
  // luật đó — siết bộ lọc lại là chúng đỏ ngay.
  {
    const { goiY } = await nhanTinRoiCho(A, BID, 'Hoà ơi, lên tiếp kế hoạch phân quyền nha.', 12000);
    check('1.5', 'nhắc tên, KHÔNG có mốc thời gian → vẫn sinh gợi ý',
      goiY !== null, 'bị bộ lọc chặn — model không được gọi');
    check('1.6', '  … và giao đúng cho người được nhắc',
      goiY?.cards?.[0]?.assigneeId === B_UID, `assigneeId=${goiY?.cards?.[0]?.assigneeId}`);
    check('1.7', '  … và KHÔNG bịa ra hạn chót',
      !goiY?.cards?.[0]?.dueDate, `dueDate=${goiY?.cards?.[0]?.dueDate}`);
  }
  {
    const { goiY } = await nhanTinRoiCho(A, BID, 'Lên tiếp kế hoạch phân quyền nha H.', 6000);
    check('1.8', 'gọi tắt "H." (không khớp tên thật) → vẫn bỏ qua, ĐÚNG THIẾT KẾ',
      goiY === null, 'khớp một chữ cái là mọi câu tiếng Việt đều lọt');
  }

  if (BO_QUA_LLM) {
    console.log(`\n${DIM}Bỏ qua mục 2–6 (--skip-llm).${RS}`);
  } else {
    section('2. 🇻🇳 KỊCH BẢN TIẾNG VIỆT');

    const viet = await nhanTinRoiCho(
      A, BID,
      'Ê Hoà, mày giúp tao làm chức năng thêm giỏ hàng đi nhanh nhanh giúp tao trong hôm nay nhé để tao còn làm chức năng thanh toán.',
    );
    check('2.1', 'gửi tin nhắn trả về NGAY (dưới 1.5s, không chờ model)',
      viet.doTreGuiTin < 1500, `mất ${viet.doTreGuiTin}ms`);
    check('2.2', 'sinh được gợi ý', !!viet.goiY, 'không thấy gợi ý sau 25s');

    const theViet = viet.goiY?.cards ?? [];
    check('2.3', 'trích ra ĐÚNG 2 thẻ', theViet.length === 2,
      `nhận ${theViet.length}: ${JSON.stringify(theViet.map((c) => c.title))}`);

    const gioHang = theViet.find((c) => /giỏ hàng|gio hang|cart/i.test(c.title));
    const thanhToan = theViet.find((c) => /thanh toán|thanh toan|checkout|payment/i.test(c.title));
    check('2.4', 'có thẻ "giỏ hàng"', !!gioHang, JSON.stringify(theViet.map((c) => c.title)));
    check('2.5', 'có thẻ "thanh toán"', !!thanhToan, JSON.stringify(theViet.map((c) => c.title)));
    check('2.6', 'thẻ giỏ hàng giao cho HOÀ', gioHang?.assigneeId === B_UID,
      `nhận ${gioHang?.assigneeId === A_UID ? 'Huy' : (gioHang?.assigneeId ?? 'trống')}`);
    check('2.7', 'thẻ giỏ hàng hạn = HÔM NAY', gioHang?.dueDate === homNay, `nhận ${gioHang?.dueDate ?? 'trống'}`);
    check('2.8', 'thẻ thanh toán giao cho HUY (hiểu "tao" = người gửi)',
      thanhToan?.assigneeId === A_UID,
      `nhận ${thanhToan?.assigneeId === B_UID ? 'Hoà' : (thanhToan?.assigneeId ?? 'trống')}`);
    check('2.9', 'tên thẻ NGẮN GỌN, không chép nguyên câu chat',
      theViet.every((c) => c.title.length < 60), JSON.stringify(theViet.map((c) => c.title.length)));
    check('2.10', 'tên thẻ bằng TIẾNG VIỆT (có dấu)', theViet.every((c) => coDau(c.title)),
      JSON.stringify(theViet.map((c) => c.title)));
    check('2.11', 'mọi thẻ đều có listId thuộc board', theViet.every((c) => !!c.listId),
      JSON.stringify(theViet.map((c) => c.listId)));

    section('3. 🇬🇧 KỊCH BẢN TIẾNG ANH');

    const anh = await nhanTinRoiCho(
      A, BID,
      "Hey Hoa, can you build the add-to-cart feature by end of day today? I'll take the checkout flow after that.",
    );
    const theAnh = anh.goiY?.cards ?? [];
    check('3.1', 'sinh được gợi ý', !!anh.goiY, 'không thấy gợi ý sau 25s');
    check('3.2', 'trích ra ĐÚNG 2 thẻ', theAnh.length === 2,
      `nhận ${theAnh.length}: ${JSON.stringify(theAnh.map((c) => c.title))}`);

    const cart = theAnh.find((c) => /cart/i.test(c.title));
    const checkout = theAnh.find((c) => /checkout|payment/i.test(c.title));
    check('3.3', 'có thẻ "cart"', !!cart, JSON.stringify(theAnh.map((c) => c.title)));
    check('3.4', 'thẻ cart giao cho HOÀ', cart?.assigneeId === B_UID,
      `nhận ${cart?.assigneeId === A_UID ? 'Huy' : (cart?.assigneeId ?? 'trống')}`);
    check('3.5', 'thẻ cart hạn = HÔM NAY', cart?.dueDate === homNay, `nhận ${cart?.dueDate ?? 'trống'}`);
    check('3.6', "thẻ checkout giao cho HUY (hiểu \"I'll\" = người gửi)",
      checkout?.assigneeId === A_UID,
      `nhận ${checkout?.assigneeId === B_UID ? 'Hoà' : (checkout?.assigneeId ?? 'trống')}`);
    check('3.7', 'tên thẻ bằng TIẾNG ANH (không dấu tiếng Việt)',
      theAnh.every((c) => !coDau(c.title)), JSON.stringify(theAnh.map((c) => c.title)));

    section('4. 🔀 TRỘN ANH–VIỆT');

    const tron = await nhanTinRoiCho(A, BID, 'Hoà ơi fix cái bug login trước thứ 6 nhé, gấp lắm');
    const theTron = tron.goiY?.cards ?? [];
    check('4.1', 'sinh được gợi ý', !!tron.goiY);
    check('4.2', 'trích ra 1 thẻ', theTron.length === 1, `nhận ${theTron.length}`);
    check('4.3', 'giao cho HOÀ', theTron[0]?.assigneeId === B_UID, `nhận ${theTron[0]?.assigneeId ?? 'trống'}`);
    check('4.4', 'có hạn chót (quy "thứ 6" ra ngày cụ thể)',
      /^\d{4}-\d{2}-\d{2}$/.test(theTron[0]?.dueDate ?? ''), `nhận ${theTron[0]?.dueDate ?? 'trống'}`);
    {
      const d = theTron[0]?.dueDate ? new Date(`${theTron[0].dueDate}T00:00:00Z`) : null;
      check('4.5', 'ngày đó đúng là THỨ SÁU và ở tương lai',
        !!d && d.getUTCDay() === 5 && theTron[0].dueDate > homNay,
        `${theTron[0]?.dueDate} (getUTCDay=${d ? d.getUTCDay() : '?'}), hôm nay ${homNay}`);
    }
    check('4.6', 'ưu tiên CAO ("gấp lắm")', theTron[0]?.priority === 'high', `nhận ${theTron[0]?.priority}`);

    section('5. CHẤP NHẬN · QUYỀN · CHỐNG TRÙNG');

    const goiY = viet.goiY;

    const [stD] = await api('GET', `/task-suggestions?boardId=${BID}`, D);
    check('5.1', '🔒 D (ngoài tổ chức) đọc gợi ý → 404', stD === 404, `nhận ${stD}`);
    const [stDAccept] = await api('POST', `/task-suggestions/${goiY.id}/accept`, D, {
      cards: [{ title: 'trộm', listId: L1 }],
    });
    check('5.2', '🔒 D chấp nhận gợi ý của board A → 404', stDAccept === 404, `nhận ${stDAccept}`);

    const [stCho, dsCho] = await api('GET', `/task-suggestions?boardId=${BID}`, B);
    check('5.3', 'B (cùng board) đọc được danh sách chờ', stCho === 200 && dsCho.length >= 1,
      `nhận ${stCho}, ${dsCho?.length} gợi ý`);

    const truoc = (await api('GET', `/cards?boardId=${BID}`, A))[1].length;
    const [stOk, ketQua] = await api('POST', `/task-suggestions/${goiY.id}/accept`, A, {
      cards: [
        { title: 'Chức năng thêm giỏ hàng', listId: L1, assigneeId: B_UID, dueDate: homNay, priority: 'high' },
        { title: 'Chức năng thanh toán', listId: L1, assigneeId: A_UID },
      ],
    });
    check('5.4', 'chấp nhận → 200', stOk === 200, `nhận ${stOk}: ${JSON.stringify(ketQua)}`);
    check('5.5', 'tạo đúng 2 thẻ', ketQua?.createdCardIds?.length === 2, JSON.stringify(ketQua));

    const sau = (await api('GET', `/cards?boardId=${BID}`, A))[1];
    check('5.6', 'board có thêm đúng 2 thẻ', sau.length === truoc + 2, `${truoc} → ${sau.length}`);
    const theGioHang = sau.find((c) => c.title === 'Chức năng thêm giỏ hàng');
    check('5.7', 'thẻ tạo ra giữ đúng người phụ trách + hạn + ưu tiên',
      theGioHang?.assigneeId === B_UID && theGioHang?.dueDate === homNay && theGioHang?.priority === 'high',
      JSON.stringify({ assignee: theGioHang?.assigneeId, due: theGioHang?.dueDate, priority: theGioHang?.priority }));

    const [stLai] = await api('POST', `/task-suggestions/${goiY.id}/accept`, A, {
      cards: [{ title: 'Tạo lần hai', listId: L1 }],
    });
    check('5.8', '🔒 chấp nhận LẦN HAI → 409 (chống tạo thẻ trùng)', stLai === 409, `nhận ${stLai}`);
    const sauNua = (await api('GET', `/cards?boardId=${BID}`, A))[1];
    check('5.9', 'lần hai KHÔNG tạo thêm thẻ nào', sauNua.length === sau.length, `${sau.length} → ${sauNua.length}`);

    const [stConLai, conLai] = await api('GET', `/task-suggestions?boardId=${BID}`, A);
    check('5.10', 'gợi ý đã xử lý biến khỏi danh sách chờ',
      stConLai === 200 && !conLai.some((s) => s.id === goiY.id), JSON.stringify(conLai?.map((s) => s.id)));

    const [stBoQua] = await api('POST', `/task-suggestions/${anh.goiY.id}/dismiss`, B, {});
    check('5.11', 'thành viên thường bỏ qua được gợi ý → 200', stBoQua === 200, `nhận ${stBoQua}`);
    const [stBoQuaLai] = await api('POST', `/task-suggestions/${anh.goiY.id}/dismiss`, B, {});
    check('5.12', 'bỏ qua lần hai → 409', stBoQuaLai === 409, `nhận ${stBoQuaLai}`);

    section('6. GỢI Ý VỀ NGAY QUA WEBSOCKET');

    const bSocket = io(BASE, { auth: { token: B }, transports: ['websocket'] });
    sockets.push(bSocket);
    const bEvents = [];
    bSocket.on('board:event', (e) => bEvents.push(e));
    await new Promise((res) => { bSocket.on('connect', res); setTimeout(res, 5000); });
    await new Promise((res) => bSocket.emit('board:join', { boardId: BID }, res));

    bEvents.length = 0;
    await nhanTinRoiCho(A, BID, 'Hoà ơi viết giúp mình phần test đăng nhập trong hôm nay nhé');
    await sleep(1200);

    const ev = bEvents.find((e) => e.type === 'suggestion.created');
    check('6.1', 'B nhận sự kiện "suggestion.created" mà không cần gọi API', !!ev,
      `nhận ${bEvents.length} sự kiện: ${bEvents.map((e) => e.type).join(', ') || '(không có)'}`);
    check('6.2', 'sự kiện mang sẵn danh sách thẻ (khỏi gọi thêm API)',
      Array.isArray(ev?.data?.cards) && ev.data.cards.length > 0, JSON.stringify(ev?.data?.cards));
    check('6.3', 'kèm messageId để vẽ chip đúng chỗ', !!ev?.data?.messageId, JSON.stringify(ev?.data?.messageId));

    if (ev) {
      bEvents.length = 0;
      await api('POST', `/task-suggestions/${ev.data.id}/dismiss`, A, {});
      await sleep(900);
      check('6.4', 'bỏ qua → B nhận "suggestion.resolved"',
        bEvents.some((e) => e.type === 'suggestion.resolved'),
        bEvents.map((e) => e.type).join(', ') || '(không có)');
    }
  }
} finally {
  await cleanup();
  console.log(`\n${Y}── Dọn dẹp ${'─'.repeat(46)}${RS}`);
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
