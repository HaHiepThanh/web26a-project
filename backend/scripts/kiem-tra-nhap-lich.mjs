#!/usr/bin/env node
/**
 * Kiểm tra NHẬP LỊCH .ics đầu-cuối, bằng file THẬT do Google và Apple xuất ra.
 *
 *     cd backend && npm run start:dev
 *     node scripts/kiem-tra-nhap-lich.mjs
 *
 * File thật đặt ở ~/Downloads và KHÔNG commit vào repo — chúng chứa lịch cá
 * nhân thật (tên buổi học, email người dự). Thiếu file thì script bỏ qua phần
 * đó chứ không đỏ.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
function duongDanEnv() {
  const uuTien = [join(ROOT, '..', 'secrets', '.env'), join(ROOT, '.env')];
  return uuTien.find((p) => existsSync(p)) ?? uuTien[0];
}
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const G='\x1b[32m', R='\x1b[31m', Y='\x1b[33m', DIM='\x1b[2m', RS='\x1b[0m';
const pass=[], fail=[];
const check=(d,ok,why='')=>{(ok?pass:fail).push({d,why});console.log(`  ${ok?G+'✔'+RS:R+'✘'+RS} ${d}`);if(!ok&&why)console.log(`      ${R}→ ${why}${RS}`);};
const section=(t)=>console.log(`\n${Y}── ${t} ${'─'.repeat(Math.max(0,48-t.length))}${RS}`);

function env(n){for(const l of readFileSync(duongDanEnv(),'utf8').split('\n')){const t=l.trim();if(!t||t.startsWith('#')||!t.includes('='))continue;const[k,...r]=t.split('=');if(k.trim()===n)return r.join('=').trim().replace(/^["']|["']$/g,'');}return null;}
function apiKey(){const d=join(ROOT,'postman');for(const f of readdirSync(d).sort()){if(!f.endsWith('.postman_environment.json'))continue;const e=JSON.parse(readFileSync(join(d,f),'utf8'));const h=e.values.find(v=>v.key==='firebaseApiKey'&&v.value);if(h)return h.value;}return null;}
const KEY=apiKey();
async function firebase(op,email,pw='Passw0rd!'){const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${op}?key=${KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pw,returnSecureToken:true})});return r.json();}
async function api(m,p,t,b){const r=await fetch(BASE+p,{method:m,headers:{...(t?{Authorization:`Bearer ${t}`}:{}),...(b!==undefined?{'Content-Type':'application/json'}:{})},...(b!==undefined?{body:JSON.stringify(b)}:{})});const x=await r.text();let j=null;try{j=x?JSON.parse(x):null}catch{j=x}return[r.status,j];}
async function sql(path,method='GET',body){const u=env('SUPABASE_URL'),k=env('SUPABASE_SERVICE_ROLE_KEY');const r=await fetch(`${u}/rest/v1/${path}`,{method,headers:{apikey:k,Authorization:`Bearer ${k}`,'Content-Type':'application/json',Prefer:'return=representation'},...(body!==undefined?{body:JSON.stringify(body)}:{})});const t=await r.text();try{return t?JSON.parse(t):null}catch{return t}}
async function upload(token, buf, name, extra={}) {
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'text/calendar' }), name);
  for (const [k,v] of Object.entries(extra)) fd.append(k, v);
  const r = await fetch(BASE + '/meetings/parse-ics', { method:'POST', headers:{ Authorization:`Bearer ${token}` }, body: fd });
  const t = await r.text(); let j=null; try{ j=t?JSON.parse(t):null }catch{ j=t }
  return [r.status, j];
}

console.log(`\n${Y}KIỂM TRA NHẬP LỊCH .ics${RS}\n${DIM}${BASE}${RS}`);
if(!KEY||(await api('GET','/health'))[0]!==200){console.log(`${R}Thiếu firebaseApiKey hoặc backend chưa chạy.${RS}\n`);process.exit(1);}

const seed=Date.now().toString(36);
let cred=await firebase('signUp',`nl-${seed}@test.dev`); if(!cred.idToken) cred=await firebase('signInWithPassword',`nl-${seed}@test.dev`);
const A={token:cred.idToken,uid:cred.localId};
await api('POST','/auth/sync',A.token,{});
const [,org]=await api('POST','/organizations',A.token,{name:`NL ${seed}`,slug:`nl-${seed}`});
const [,ws]=await api('POST','/workspaces',A.token,{orgId:org.id,name:'WS'});
const [,board]=await api('POST','/boards',A.token,{workspaceId:ws.id,name:'Board nhap lich'});
console.log(`${G}✔${RS} da dung org/board\n`);

// ------------------------------------------------------------ file tong hop
section('FILE TỰ DỰNG — các ca hiểm');
const ics = (than) => ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//test//EN',...than,'END:VCALENDAR'].join('\r\n');

// BYDAY nhiều ngày — chỗ bộ đọc TỰ VIẾT sai (mất 2/3 số buổi)
const [,byday] = await upload(A.token, ics([
  'BEGIN:VEVENT','UID:a@t','SUMMARY:Standup','DTSTART:20260907T020000Z','DTEND:20260907T023000Z',
  'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6','END:VEVENT',
]), 'byday.ics', { tuNgay:'2026-09-01', denNgay:'2026-09-30' });
check('BYDAY=MO,WE,FR cho ra ĐỦ 6 buổi (bản tự viết chỉ ra 6 thứ Hai)',
  byday?.suKien?.length === 6, `duoc ${byday?.suKien?.length}`);
const thu = [...new Set((byday?.suKien??[]).map(s => new Date(s.startAt).getUTCDay()))].sort();
check('rơi đúng vào thứ 2, 4, 6', JSON.stringify(thu) === '[1,3,5]', JSON.stringify(thu));

// EXDATE — loại đúng buổi bị bỏ
const [,exd] = await upload(A.token, ics([
  'BEGIN:VEVENT','UID:b@t','SUMMARY:Daily','DTSTART:20260907T020000Z','DTEND:20260907T023000Z',
  'RRULE:FREQ=DAILY;COUNT=5','EXDATE:20260909T020000Z','END:VEVENT',
]), 'exdate.ics', { tuNgay:'2026-09-01', denNgay:'2026-09-30' });
check('EXDATE loại đúng một buổi (5-1=4)', exd?.suKien?.length === 4, `duoc ${exd?.suKien?.length}`);

// RECURRENCE-ID — ngoại lệ THAY buổi, không CỘNG THÊM
const [,rid] = await upload(A.token, ics([
  'BEGIN:VEVENT','UID:c@t','SUMMARY:Weekly','DTSTART:20260907T020000Z','DTEND:20260907T023000Z',
  'RRULE:FREQ=WEEKLY;COUNT=3','END:VEVENT',
  'BEGIN:VEVENT','UID:c@t','RECURRENCE-ID:20260914T020000Z','SUMMARY:Weekly (doi gio)',
  'DTSTART:20260914T060000Z','DTEND:20260914T063000Z','END:VEVENT',
]), 'rid.ics', { tuNgay:'2026-09-01', denNgay:'2026-09-30' });
check('RECURRENCE-ID THAY buổi, không nhân đôi (đúng 3)',
  rid?.suKien?.length === 3, `duoc ${rid?.suKien?.length}`);
check('buổi bị dời được đánh dấu là ngoại lệ',
  (rid?.suKien??[]).some(s => s.laNgoaiLe), JSON.stringify((rid?.suKien??[]).map(s=>s.laNgoaiLe)));

// STATUS:CANCELLED — không nhập buổi đã huỷ
const [,huy] = await upload(A.token, ics([
  'BEGIN:VEVENT','UID:d@t','SUMMARY:Da huy','DTSTART:20260910T020000Z','STATUS:CANCELLED','END:VEVENT',
  'BEGIN:VEVENT','UID:e@t','SUMMARY:Con hieu luc','DTSTART:20260911T020000Z','END:VEVENT',
]), 'huy.ics', { tuNgay:'2026-09-01', denNgay:'2026-09-30' });
check('buổi STATUS:CANCELLED bị bỏ',
  huy?.suKien?.length === 1 && huy.suKien[0].title === 'Con hieu luc', JSON.stringify(huy?.suKien?.map(s=>s.title)));

// HTML trong mô tả của Google
const [,html] = await upload(A.token, ics([
  'BEGIN:VEVENT','UID:f@t','SUMMARY:Co HTML','DTSTART:20260911T020000Z',
  'DESCRIPTION:<p dir="ltr">Xin chao</p><br>Dong hai','END:VEVENT',
]), 'html.ics', { tuNgay:'2026-09-01', denNgay:'2026-09-30' });
check('thẻ HTML bị gỡ khỏi mô tả',
  !/<[a-z]/i.test(html?.suKien?.[0]?.description ?? ''), JSON.stringify(html?.suKien?.[0]?.description));

// File rác
const [stRac] = await upload(A.token, Buffer.from('%PDF-1.7 khong phai lich'), 'rac.pdf');
check('file không phải lịch → 400', stRac === 400, `status ${stRac}`);
const [stRong] = await upload(A.token, Buffer.from(''), 'rong.ics');
check('file rỗng → 400', stRong === 400, `status ${stRong}`);

// ------------------------------------------------------------ file THẬT
section('FILE THẬT (Google + Apple)');
const thatSu = [
  [process.env.HOME + '/Downloads/hahiepthanhhhtt@gmail.com.ics', 'Google'],
  [process.env.HOME + '/Downloads/LichApple.ics', 'Apple'],
].filter(([p]) => existsSync(p));

if (thatSu.length === 0) {
  console.log(`  ${DIM}(khong tim thay file that trong ~/Downloads — bo qua)${RS}`);
} else {
  const ket = [];
  for (const [p, nhan] of thatSu) {
    const [st, kq] = await upload(A.token, readFileSync(p), 'that.ics', { tuNgay:'2025-09-01', denNgay:'2026-12-31' });
    check(`${nhan}: đọc được`, st === 201 || st === 200, `status ${st}`);
    check(`${nhan}: không còn thẻ HTML trong mô tả`,
      (kq?.suKien??[]).every(s => !/<[a-z]/i.test(s.description ?? '')));
    check(`${nhan}: nhận ra 6 ngoại lệ RECURRENCE-ID`,
      (kq?.suKien??[]).filter(s => s.laNgoaiLe).length === 6,
      `${(kq?.suKien??[]).filter(s=>s.laNgoaiLe).length}`);
    check(`${nhan}: báo rõ số bị cắt thay vì mất im lặng`, typeof kq?.soBiCat === 'number', `${kq?.soBiCat}`);
    ket.push(JSON.stringify((kq?.suKien??[]).map(s => s.startAt + '|' + s.title).sort()));
  }
  if (ket.length === 2) {
    check('Google và Apple cho ra KẾT QUẢ GIỐNG HỆT NHAU', ket[0] === ket[1],
      'hai file cung mot lich ma doc ra khac nhau');
  }
}

// ------------------------------------------------------------ nhập thật
section('GHI VÀO BOARD');
const [stNhap, kqNhap] = await api('POST','/meetings/import',A.token,{
  boardId: board.id, timeZone: 'Asia/Ho_Chi_Minh',
  events: [
    { title:'Buoi 1', startAt:'2026-10-01T02:00:00.000Z', endAt:'2026-10-01T03:00:00.000Z' },
    { title:'Buoi 2', startAt:'2026-10-02T02:00:00.000Z', endAt:'2026-10-02T03:00:00.000Z' },
    { title:'Gio hong', startAt:'2026-10-03T03:00:00.000Z', endAt:'2026-10-03T02:00:00.000Z' },
  ],
});
check('nhập được hàng loạt', stNhap === 201, `status ${stNhap} ${JSON.stringify(kqNhap)}`);
check('bỏ qua buổi có giờ hỏng thay vì đổ cả mẻ',
  kqNhap?.daTao === 2 && kqNhap?.boQua === 1, JSON.stringify(kqNhap));

const [,ds] = await api('GET',`/meetings?boardId=${board.id}`,A.token);
check('buổi nhập KHÔNG có sự kiện Google (không đẩy ngược lên)',
  (ds??[]).every(m => m.googleEventId === null));
check('buổi nhập KHÔNG tự bật nhắc (nhập cả kỳ thì chuông kêu suốt)',
  (ds??[]).every(m => m.remindMinutes === 0));

const [stRong2] = await api('POST','/meetings/import',A.token,{ boardId: board.id, timeZone:'Asia/Ho_Chi_Minh', events: [] });
check('danh sách rỗng → 400', stRong2 === 400, `status ${stRong2}`);
const [stQua] = await api('POST','/meetings/import',A.token,{
  boardId: board.id, timeZone:'Asia/Ho_Chi_Minh',
  events: Array.from({length:250},(_,i)=>({ title:'x', startAt:`2026-10-01T02:00:00.000Z`, endAt:`2026-10-01T03:00:00.000Z` })),
});
check('quá 200 buổi → 400', stQua === 400, `status ${stQua}`);

section('DỌN DẸP');
await sql(`board_meetings?board_id=eq.${board.id}`,'DELETE');
await api('DELETE',`/boards/${board.id}`,A.token);
await api('DELETE',`/workspaces/${ws.id}`,A.token);
await sql(`organizations?id=eq.${org.id}`,'DELETE');
await sql(`users?id=eq.${A.uid}`,'DELETE');
console.log(`  ${DIM}đã xoá dữ liệu test${RS}`);

console.log(`\n${Y}${'─'.repeat(50)}${RS}`);
console.log(`  ${G}${pass.length} đạt${RS}   ${fail.length?R:DIM}${fail.length} hỏng${RS}`);
if(fail.length) process.exit(1);
console.log(`  ${G}Tất cả đạt.${RS}\n`);
