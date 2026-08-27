#!/usr/bin/env node
/**
 * Kiểm tra KIỂM DUYỆT ẢNH trên cả ba đường upload thật.
 *
 *     cd backend && npm run start:dev            # cửa sổ 1
 *     node scripts/kiem-tra-kiem-duyet-anh.mjs   # cửa sổ 2
 *
 * Gọi API THẬT (Gemini/Vision) với ảnh lành, nên có tốn vài lượt gọi.
 * KHÔNG dùng ảnh vi phạm — phần true-positive phải người thật thử.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

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
const G='\x1b[32m', R='\x1b[31m', Y='\x1b[33m', DIM='\x1b[2m', RS='\x1b[0m';
const pass=[], fail=[];
const check=(d,ok,why='')=>{(ok?pass:fail).push({d,why});console.log(`  ${ok?G+'✔'+RS:R+'✘'+RS} ${d}`);if(!ok&&why)console.log(`      ${R}→ ${why}${RS}`);};
const section=(t)=>console.log(`\n${Y}── ${t} ${'─'.repeat(Math.max(0,50-t.length))}${RS}`);

function env(n){for(const l of readFileSync(duongDanEnv(), 'utf8').split('\n')){const t=l.trim();if(!t||t.startsWith('#')||!t.includes('='))continue;const[k,...r]=t.split('=');if(k.trim()===n)return r.join('=').trim().replace(/^["']|["']$/g,'');}return null;}
function apiKey(){const d=join(ROOT,'postman');for(const f of readdirSync(d).sort()){if(!f.endsWith('.postman_environment.json'))continue;const e=JSON.parse(readFileSync(join(d,f),'utf8'));const h=e.values.find(v=>v.key==='firebaseApiKey'&&v.value);if(h)return h.value;}return null;}
const KEY=apiKey();
async function firebase(op,email,pw='Passw0rd!'){const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${op}?key=${KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pw,returnSecureToken:true})});return r.json();}
async function api(m,p,t,b){const r=await fetch(BASE+p,{method:m,headers:{...(t?{Authorization:`Bearer ${t}`}:{}),...(b!==undefined?{'Content-Type':'application/json'}:{})},...(b!==undefined?{body:JSON.stringify(b)}:{})});const x=await r.text();let j=null;try{j=x?JSON.parse(x):null}catch{j=x}return[r.status,j];}
async function sql(path,method='GET',body){const u=env('SUPABASE_URL'),k=env('SUPABASE_SERVICE_ROLE_KEY');const r=await fetch(`${u}/rest/v1/${path}`,{method,headers:{apikey:k,Authorization:`Bearer ${k}`,'Content-Type':'application/json',Prefer:'return=representation'},...(body!==undefined?{body:JSON.stringify(body)}:{})});const t=await r.text();try{return t?JSON.parse(t):null}catch{return t}}

/** Gửi file thật qua multipart. */
async function upload(path, token, buffer, filename, mime, truong = {}) {
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: mime }), filename);
  // `POST /attachments` nhận cardId trong THÂN multipart (@Body), không phải query.
  for (const [k, v] of Object.entries(truong)) fd.append(k, v);
  const r = await fetch(BASE + path, { method:'POST', headers:{ Authorization:`Bearer ${token}` }, body: fd });
  const t = await r.text();
  let j=null; try{ j=t?JSON.parse(t):null }catch{ j=t }
  return [r.status, j];
}

// ---- dựng ảnh thật ----
function png(w,h,rgb){
  const raw=Buffer.concat(Array.from({length:h},()=>Buffer.concat([Buffer.from([0]),Buffer.concat(Array.from({length:w},()=>Buffer.from(rgb)))])));
  const chunk=(t,d)=>{const c=Buffer.concat([Buffer.from(t),d]);const len=Buffer.alloc(4);len.writeUInt32BE(d.length);const crc=Buffer.alloc(4);crc.writeUInt32BE(zlib.crc32?zlib.crc32(c):crc32(c));return Buffer.concat([len,c,crc]);};
  function crc32(buf){let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}let x=0xFFFFFFFF;for(const b of buf)x=t[(x^b)&0xFF]^(x>>>8);return (x^0xFFFFFFFF)>>>0;}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
const ANH_SACH = png(200,200,[70,140,210]);
const GIF = Buffer.concat([Buffer.from('GIF89a','ascii'),Buffer.alloc(200,0x41)]);
const EXE = Buffer.concat([Buffer.from([0x4d,0x5a]),Buffer.alloc(200,0x41)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n%','ascii'),Buffer.alloc(200,0x41)]);

console.log(`\n${Y}KIỂM TRA KIỂM DUYỆT ẢNH${RS}\n${DIM}${BASE}${RS}`);
if(!KEY||(await api('GET','/health'))[0]!==200){console.log(`${R}Thiếu firebaseApiKey hoặc backend chưa chạy.${RS}\n`);process.exit(1);}

const seed=Date.now().toString(36);
const email=`kd-${seed}@test.dev`;
let cred=await firebase('signUp',email); if(!cred.idToken) cred=await firebase('signInWithPassword',email);
const A={token:cred.idToken,uid:cred.localId};
await api('POST','/auth/sync',A.token,{});
const [stOrg,org]=await api('POST','/organizations',A.token,{name:`KD ${seed}`,slug:`kd-${seed}`});
if(!org?.id){console.log(`${R}Không tạo được tổ chức: ${stOrg}${RS}`);process.exit(1);}
const [,ws]=await api('POST','/workspaces',A.token,{orgId:org.id,name:'WS'});
const [,board]=await api('POST','/boards',A.token,{workspaceId:ws.id,name:'Board KD'});
const [,list]=await api('POST','/lists',A.token,{boardId:board.id,name:'To do'});
const [,card]=await api('POST','/cards',A.token,{listId:list.id,title:'The KD'});
console.log(`${G}✔${RS} da dung org/board/list/card\n`);

// ------------------------------------------------------------------ AVATAR
section('AVATAR (bucket CÔNG KHAI)');
const t0=Date.now();
const [stA]=await upload('/auth/avatar',A.token,ANH_SACH,'ok.png','image/png');
check(`ảnh sạch được chấp nhận (${Date.now()-t0}ms)`, stA===200||stA===201, `status ${stA}`);

const [stGif,gif]=await upload('/auth/avatar',A.token,GIF,'x.gif','image/gif');
check('GIF bị từ chối (không quét được ảnh động)', stGif===400 && /GIF/i.test(JSON.stringify(gif)), `status ${stGif} ${JSON.stringify(gif)}`);

const [stExe,exe]=await upload('/auth/avatar',A.token,EXE,'anh.png','image/png');
check('file .exe đội lốt .png bị từ chối (magic bytes)', stExe===400 && /not a valid/i.test(JSON.stringify(exe)), `status ${stExe} ${JSON.stringify(exe)}`);

const [stPdfA,pdfA]=await upload('/auth/avatar',A.token,PDF,'anh.png','image/png');
check('PDF đội lốt ảnh bị từ chối', stPdfA===400, `status ${stPdfA} ${JSON.stringify(pdfA)}`);

// ------------------------------------------------------------------ NEN BOARD
section('ẢNH NỀN BOARD');
const [stB]=await upload(`/boards/${board.id}/background`,A.token,ANH_SACH,'nen.png','image/png');
check('ảnh sạch được chấp nhận', stB===200||stB===201, `status ${stB}`);
const [stBg]=await upload(`/boards/${board.id}/background`,A.token,GIF,'nen.gif','image/gif');
check('GIF bị từ chối', stBg===400, `status ${stBg}`);

// ------------------------------------------------------------------ DINH KEM
section('ĐÍNH KÈM THẺ');
const F = { cardId: card.id };
const [stAt,at]=await upload('/attachments',A.token,ANH_SACH,'anh.png','image/png',F);
check('ảnh sạch được chấp nhận', stAt===200||stAt===201, `status ${stAt} ${JSON.stringify(at)}`);
check('ảnh sạch tự thành BÌA THẺ — đúng lý do đường này phải lọc', at?.isCover===true, JSON.stringify(at));

const [stPdf]=await upload('/attachments',A.token,PDF,'tailieu.pdf','application/pdf',F);
check('PDF (không phải ảnh) vẫn đi qua bình thường', stPdf===200||stPdf===201, `status ${stPdf}`);

const [stGifAt,gifAt]=await upload('/attachments',A.token,GIF,'x.gif','image/gif',F);
check('GIF bị từ chối ở cả đường này', stGifAt===400, `status ${stGifAt} ${JSON.stringify(gifAt)}`);

const [stExeAt,exeAt]=await upload('/attachments',A.token,EXE,'anh.png','image/png',F);
check('.exe đội lốt .png bị chặn (magic bytes)', stExeAt===400 && /Executable/i.test(JSON.stringify(exeAt)),
  `status ${stExeAt} ${JSON.stringify(exeAt)}`);

// Script dạng văn bản thuần không có magic bytes — chỉ cái đuôi mới tố cáo.
const [stBat]=await upload('/attachments',A.token,Buffer.from('echo hello','ascii'),'run.bat','text/plain',F);
check('.bat bị chặn theo đuôi tệp', stBat===400, `status ${stBat}`);

// Windows mặc định ẩn đuôi đã biết nên người nhận chỉ thấy "bao-cao.pdf".
const [stKep]=await upload('/attachments',A.token,PDF,'bao-cao.pdf.exe','application/pdf',F);
check('mẹo đuôi kép "bao-cao.pdf.exe" bị chặn', stKep===400, `status ${stKep}`);

// Nhóm làm phần mềm gửi nhau mã nguồn xem hộ là việc bình thường.
const [stJs]=await upload('/attachments',A.token,Buffer.from('console.log(1)','ascii'),'index.js','text/javascript',F);
check('mã nguồn .js KHÔNG bị chặn nhầm', stJs===200||stJs===201, `status ${stJs}`);

// ------------------------------------------------------------------ don
section('DỌN DẸP');
await api('DELETE',`/boards/${board.id}`,A.token);
await api('DELETE',`/workspaces/${ws.id}`,A.token);
await sql(`organizations?id=eq.${org.id}`,'DELETE');
await sql(`users?id=eq.${A.uid}`,'DELETE');
console.log(`  ${DIM}đã xoá dữ liệu test${RS}`);

console.log(`\n${Y}${'─'.repeat(52)}${RS}`);
console.log(`  ${G}${pass.length} đạt${RS}   ${fail.length?R:DIM}${fail.length} hỏng${RS}`);
if(fail.length){process.exit(1);}
console.log(`  ${G}Tất cả đạt.${RS}\n`);
