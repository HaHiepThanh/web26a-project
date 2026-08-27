/**
 * ĐỌC VÀ VIẾT FILE .ics (iCalendar, RFC 5545).
 *
 * Đây là định dạng DUY NHẤT mà Apple Calendar và Google Calendar cùng nhập
 * được. PDF không mang dữ liệu sự kiện có cấu trúc nên không nhập vào lịch nào
 * được — bản PDF trong app này chỉ để đọc/in.
 *
 * ─── NHỮNG CHỖ CỦA RFC 5545 RẤT DỄ LÀM SAI ───
 *
 * Bốn thứ dưới đây file vẫn "trông đúng" khi mở bằng trình soạn thảo, nhưng
 * Apple Calendar từ chối hoặc hiển thị sai:
 *
 *   1. XUỐNG DÒNG PHẢI LÀ CRLF (`\r\n`), không phải `\n`.
 *   2. DÒNG DÀI PHẢI GẤP ở mốc 75 OCTET (byte, KHÔNG phải ký tự). Tiếng Việt
 *      có dấu chiếm 2-3 byte mỗi ký tự, nên một tiêu đề 40 chữ đã có thể vượt
 *      75 byte. Gấp sai chỗ giữa một ký tự nhiều byte là hỏng cả file.
 *   3. GIÁ TRỊ TEXT PHẢI THOÁT `\` `;` `,` và xuống dòng. Một dấu phẩy chưa
 *      thoát trong SUMMARY làm vài trình đọc cắt cụt tiêu đề mà không báo gì.
 *   4. FILE PHẢI KẾT THÚC BẰNG CRLF.
 *
 * ─── VÌ SAO XUẤT GIỜ THEO UTC, KHÔNG THEO TZID ───
 *
 * Dùng `DTSTART;TZID=Asia/Ho_Chi_Minh:...` thì RFC BẮT BUỘC file phải kèm cả
 * khối `VTIMEZONE` mô tả đầy đủ quy tắc đổi giờ mùa của múi giờ đó — thiếu là
 * file không hợp lệ và Apple Calendar từ chối. Dạng UTC (`...Z`) không cần
 * VTIMEZONE, và trình lịch nào cũng tự đổi về giờ địa phương của người xem.
 * Ngắn hơn, hợp lệ chắc chắn, và hiển thị đúng ở mọi múi giờ.
 */

import { docRrule, QuyTacLap, taoRrule, traiQuyTac } from './lap-lai.util';

const PRODID = '-//Horizon Hub Harmony//Meetings//EN';
/** Hậu tố UID — giữ cố định để nhập lại cùng một file là CẬP NHẬT, không nhân đôi. */
const UID_DOMAIN = 'horizon-hub-harmony';

/* ==================================================================== *
 *  VIẾT
 * ==================================================================== */

export interface SuKienXuat {
  /** Khoá bền của sự kiện. Cùng một cuộc họp phải luôn cho ra cùng một UID. */
  id: string;
  title: string;
  description?: string | null;
  /** ISO 8601. */
  startAt: string;
  endAt: string;
  /** Link phòng họp — vào ô LOCATION, chỗ Apple/Google hiện nút tham gia. */
  location?: string | null;
  url?: string | null;
  organizer?: { name?: string | null; email: string } | null;
  attendees?: { name?: string | null; email: string }[];
  /** Nhắc trước bao nhiêu phút. 0 hoặc null = không kèm VALARM. */
  remindMinutes?: number | null;
  /** Quy tắc lặp. `null` = chỉ diễn ra một lần. */
  quyTac?: QuyTacLap | null;
}

/** Gói nhiều sự kiện thành MỘT file .ics. */
export function taoIcs(suKien: SuKienXuat[]): string {
  const dong: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    // PUBLISH = "đây là bản sao để đọc", khác REQUEST (thư mời cần trả lời).
    // Dùng REQUEST thì vài trình lịch sẽ hỏi người mở "nhận lời hay không" cho
    // một cuộc họp mà họ đã trả lời từ trước rồi.
    'METHOD:PUBLISH',
  ];

  const dongDau = utcTuIso(new Date().toISOString());
  for (const s of suKien) {
    dong.push('BEGIN:VEVENT');
    dong.push(`UID:${s.id}@${UID_DOMAIN}`);
    dong.push(`DTSTAMP:${dongDau}`);
    dong.push(`DTSTART:${utcTuIso(s.startAt)}`);
    dong.push(`DTEND:${utcTuIso(s.endAt)}`);
    dong.push(`SUMMARY:${thoat(s.title)}`);
    if (s.description) dong.push(`DESCRIPTION:${thoat(s.description)}`);
    if (s.location) dong.push(`LOCATION:${thoat(s.location)}`);
    if (s.url) dong.push(`URL:${thoat(s.url)}`);
    if (s.organizer) {
      const cn = s.organizer.name ? `;CN=${thamSoAnToan(s.organizer.name)}` : '';
      dong.push(`ORGANIZER${cn}:mailto:${s.organizer.email}`);
    }
    for (const k of s.attendees ?? []) {
      const cn = k.name ? `;CN=${thamSoAnToan(k.name)}` : '';
      dong.push(`ATTENDEE${cn};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${k.email}`);
    }
    // RRULE phải đứng trong VEVENT, sau DTSTART/DTEND. Một dòng duy nhất mô tả
    // cả chuỗi lặp — KHÔNG ghi mỗi lần diễn ra thành một VEVENT riêng, vì như
    // thế trình lịch coi chúng là những sự kiện rời rạc và người dùng phải xoá
    // từng cái một thay vì xoá cả chuỗi.
    const rrule = taoRrule(s.quyTac ?? null);
    if (rrule) dong.push(rrule);

    if (s.remindMinutes && s.remindMinutes > 0) {
      dong.push('BEGIN:VALARM');
      dong.push(`TRIGGER:-PT${Math.round(s.remindMinutes)}M`);
      dong.push('ACTION:DISPLAY');
      dong.push(`DESCRIPTION:${thoat(s.title)}`);
      dong.push('END:VALARM');
    }
    dong.push('END:VEVENT');
  }

  dong.push('END:VCALENDAR');
  // Gấp TỪNG dòng rồi mới nối bằng CRLF, và kết thúc file cũng bằng CRLF.
  return dong.map(gapDong).join('\r\n') + '\r\n';
}

/**
 * Gấp một dòng cho không quá 75 octet.
 *
 * Đếm theo BYTE UTF-8 chứ không theo ký tự, và duyệt theo điểm mã (`for..of`)
 * để không bao giờ cắt vào giữa một ký tự nhiều byte — cắt vào giữa là file
 * hỏng, và với tiếng Việt thì hầu như ký tự nào cũng nhiều byte.
 */
function gapDong(dong: string): string {
  const bo = new TextEncoder();
  if (bo.encode(dong).length <= 75) return dong;

  const phan: string[] = [];
  let hienTai = '';
  let soByte = 0;
  // Dòng đầu được 75 octet; các dòng nối sau mang thêm một dấu cách ở đầu, và
  // dấu cách đó CŨNG tính vào 75 — nên phần nội dung chỉ còn 74.
  let tran = 75;

  for (const ky of dong) {
    const n = bo.encode(ky).length;
    if (soByte + n > tran) {
      phan.push(hienTai);
      hienTai = ky;
      soByte = n;
      tran = 74;
    } else {
      hienTai += ky;
      soByte += n;
    }
  }
  phan.push(hienTai);
  return phan.join('\r\n ');
}

/** Thoát giá trị TEXT. Dấu `\` phải thay TRƯỚC, nếu không sẽ thoát chồng lên nhau. */
function thoat(v: string): string {
  return v
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Giá trị cho THAM SỐ (như `CN=`) — luật khác với giá trị TEXT.
 *
 * Tham số không dùng dấu `\` để thoát; có `;` `:` `,` thì phải bọc trong ngoặc
 * kép, mà bản thân ngoặc kép lại không thoát được — nên chỉ còn cách bỏ nó đi.
 */
function thamSoAnToan(v: string): string {
  const sach = v.replace(/"/g, '');
  return /[;:,]/.test(sach) ? `"${sach}"` : sach;
}

function utcTuIso(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

/* ==================================================================== *
 *  ĐỌC
 * ==================================================================== */

export interface SuKienNhap {
  uid: string | null;
  title: string;
  description: string | null;
  location: string | null;
  /** ISO 8601 — đã quy về thời điểm tuyệt đối. */
  startAt: string;
  endAt: string;
  allDay: boolean;
  /** TZID đọc được trong file, để hiển thị lại cho người dùng đối chiếu. */
  timeZone: string | null;
  remindMinutes: number | null;
  attendeeEmails: string[];
  /** Quy tắc lặp đọc được trong file. `null` = chỉ một lần. */
  quyTac: QuyTacLap | null;
  /** Sự kiện này là MỘT LẦN diễn ra được trải ra từ một quy tắc lặp. */
  laLanLap: boolean;
  /** Vấn đề KHÔNG chặn — vẫn nhập được nhưng người dùng nên biết. */
  canhBao: string[];
}

export interface KetQuaDocIcs {
  suKien: SuKienNhap[];
  /** Lỗi CHẶN — file không dùng được. `null` nghĩa là đọc được. */
  loi: string | null;
  /** Số khối VEVENT phải bỏ vì thiếu dữ liệu bắt buộc. */
  soBoQua: number;
}

/** Nhiều nhất chừng này sự kiện một file — chặn một file lịch cả năm nhập vào
 *  đây rồi bắn hàng trăm thông báo. */
export const TOI_DA_SU_KIEN = 100;

/** Tuỳ chọn khi đọc file — dùng cho việc nhập lịch theo khoảng ngày. */
export interface TuyChonNhap {
  /** Chỉ lấy sự kiện bắt đầu TỪ ngày này (dạng 'YYYY-MM-DD'). */
  tuNgay?: string | null;
  /** Chỉ lấy sự kiện bắt đầu ĐẾN HẾT ngày này. */
  denNgay?: string | null;
  /**
   * Trải sự kiện lặp thành từng lần diễn ra trong khoảng đã chọn.
   *
   * Mặc định BẬT: bộ nhắc của app đặt hẹn giờ theo một mốc cụ thể, nó không
   * biết đọc quy tắc lặp. Không trải thì một cuộc "mỗi thứ Hai" chỉ nhắc đúng
   * lần đầu rồi im.
   */
  traiLap?: boolean;
}

export function docIcs(noiDung: string, tuyChon: TuyChonNhap = {}): KetQuaDocIcs {
  const rong: KetQuaDocIcs = { suKien: [], loi: null, soBoQua: 0 };

  if (!noiDung || !noiDung.trim()) {
    return { ...rong, loi: 'The file is empty.' };
  }
  // Kiểm bằng regex chứ không phải `startsWith`: file thật hay có BOM ở đầu,
  // hoặc dòng trống, và Google xuất ra thỉnh thoảng có khoảng trắng thừa.
  if (!/^\s*﻿?\s*BEGIN:VCALENDAR/im.test(noiDung)) {
    return {
      ...rong,
      loi: 'This is not a calendar file. Export an .ics file from Apple Calendar or Google Calendar and try again.',
    };
  }

  const dong = goGap(noiDung);
  const suKien: SuKienNhap[] = [];
  let soBoQua = 0;

  let dangTrongEvent = false;
  let dangTrongAlarm = false;
  let tho: Record<string, { thamSo: Record<string, string>; giaTri: string }> = {};
  let khach: string[] = [];
  let nhac: number | null = null;

  for (const d of dong) {
    const tren = d.toUpperCase();

    if (tren === 'BEGIN:VEVENT') {
      dangTrongEvent = true;
      tho = {};
      khach = [];
      nhac = null;
      continue;
    }
    if (!dangTrongEvent) continue;

    if (tren === 'END:VEVENT') {
      dangTrongEvent = false;
      const sk = dungSuKien(tho, khach, nhac);
      if (sk) suKien.push(sk);
      else soBoQua++;
      continue;
    }

    // VALARM lồng bên trong VEVENT. Không tách riêng thì `TRIGGER` và
    // `DESCRIPTION` của chuông sẽ ghi đè mô tả của chính cuộc họp.
    if (tren === 'BEGIN:VALARM') {
      dangTrongAlarm = true;
      continue;
    }
    if (tren === 'END:VALARM') {
      dangTrongAlarm = false;
      continue;
    }

    const p = tachDong(d);
    if (!p) continue;

    if (dangTrongAlarm) {
      if (p.ten === 'TRIGGER') nhac = nhacTuTrigger(p.giaTri);
      continue;
    }

    if (p.ten === 'ATTENDEE') {
      const mail = emailTu(p.giaTri);
      if (mail) khach.push(mail);
      continue;
    }
    tho[p.ten] = { thamSo: p.thamSo, giaTri: p.giaTri };
  }

  if (suKien.length === 0) {
    return {
      suKien: [],
      soBoQua,
      loi: soBoQua
        ? `The file has ${soBoQua} event(s) but none of them has a usable start time.`
        : 'This calendar file contains no events.',
    };
  }

  const ra = locVaTrai(suKien, tuyChon);

  if (ra.length === 0) {
    return {
      suKien: [],
      soBoQua,
      loi: 'No events fall inside the date range you picked. Widen the range and try again.',
    };
  }

  ra.sort((a, b) => a.startAt.localeCompare(b.startAt));
  return { suKien: ra.slice(0, TOI_DA_SU_KIEN), loi: null, soBoQua };
}

/**
 * Bỏ gấp dòng — PHẢI làm TRƯỚC khi tách thuộc tính.
 *
 * Dòng nối tiếp bắt đầu bằng một dấu cách hoặc tab, và phần nối phải bỏ đúng
 * MỘT ký tự trắng đó (bỏ nhiều hơn là ăn mất khoảng trắng thật trong mô tả).
 * Tách thuộc tính trước rồi mới bỏ gấp thì mọi giá trị dài đều vỡ.
 */
/**
 * Trải sự kiện lặp thành từng lần diễn ra, rồi lọc theo khoảng ngày đã chọn.
 *
 * ─── VÌ SAO TRẢI RA THÀNH TỪNG DÒNG ───
 *
 * Bộ nhắc của app đặt hẹn giờ theo một mốc CỤ THỂ; nó không biết đọc quy tắc
 * lặp. Giữ nguyên một dòng kèm RRULE thì cuộc "mỗi thứ Hai" chỉ nhắc đúng lần
 * đầu rồi im mãi.
 *
 * ─── VÌ SAO PHẢI TRẢI TRƯỚC RỒI MỚI LỌC ───
 *
 * Một chuỗi lặp bắt đầu từ tháng 1 mà người dùng chọn nhập tháng 6 thì mốc bắt
 * đầu GỐC nằm ngoài khoảng — lọc trước là loại luôn cả chuỗi, và tháng 6 không
 * có gì để nhập dù thực tế tuần nào cũng có buổi.
 */
function locVaTrai(ds: SuKienNhap[], t: TuyChonNhap): SuKienNhap[] {
  const tu = t.tuNgay ? new Date(`${t.tuNgay}T00:00:00`).getTime() : null;
  // Hết ngày, không phải đầu ngày: chọn "đến 30/9" mà cắt ở 00:00 là mất sạch
  // những buổi trong chính ngày 30.
  const den = t.denNgay ? new Date(`${t.denNgay}T23:59:59.999`).getTime() : null;
  const trongKhoang = (ms: number) =>
    (tu === null || ms >= tu) && (den === null || ms <= den);

  const ra: SuKienNhap[] = [];
  for (const sk of ds) {
    const batDau = new Date(sk.startAt);
    const dai = new Date(sk.endAt).getTime() - batDau.getTime();

    if (!sk.quyTac || t.traiLap === false) {
      if (trongKhoang(batDau.getTime())) ra.push(sk);
      continue;
    }

    let lanDau = true;
    for (const moc of traiQuyTac(batDau, sk.quyTac)) {
      if (!trongKhoang(moc.getTime())) continue;
      ra.push({
        ...sk,
        startAt: moc.toISOString(),
        endAt: new Date(moc.getTime() + dai).toISOString(),
        // Chỉ lần ĐẦU giữ quy tắc: nó là dòng đại diện cho cả chuỗi khi xuất
        // lại ra .ics. Những lần sau mà cũng mang quy tắc thì xuất ra sẽ thành
        // nhiều chuỗi lặp chồng lên nhau.
        quyTac: lanDau ? sk.quyTac : null,
        laLanLap: !lanDau,
      });
      lanDau = false;
    }
  }
  return ra;
}

function goGap(noiDung: string): string[] {
  const raw = noiDung.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  const ra: string[] = [];
  for (const d of raw) {
    if ((d.startsWith(' ') || d.startsWith('\t')) && ra.length > 0) {
      ra[ra.length - 1] += d.slice(1);
    } else if (d.trim()) {
      ra.push(d);
    }
  }
  return ra;
}

/**
 * Tách `TEN;THAMSO=x:giá trị`.
 *
 * Phải tìm dấu `:` ĐẦU TIÊN NẰM NGOÀI NGOẶC KÉP — không thể `split(':')` vì
 * giá trị thường là URL (`https://meet.google.com/...`) và tham số có thể chứa
 * dấu hai chấm trong ngoặc kép.
 */
function tachDong(
  d: string,
): { ten: string; thamSo: Record<string, string>; giaTri: string } | null {
  let trongNgoac = false;
  for (let i = 0; i < d.length; i++) {
    const c = d[i];
    if (c === '"') trongNgoac = !trongNgoac;
    else if (c === ':' && !trongNgoac) {
      const dau = d.slice(0, i);
      const giaTri = d.slice(i + 1);
      const manh = tachTheoChamPhay(dau);
      const ten = (manh.shift() ?? '').toUpperCase();
      if (!ten) return null;
      const thamSo: Record<string, string> = {};
      for (const m of manh) {
        const k = m.indexOf('=');
        if (k > 0) {
          thamSo[m.slice(0, k).toUpperCase()] = m.slice(k + 1).replace(/^"|"$/g, '');
        }
      }
      return { ten, thamSo, giaTri };
    }
  }
  return null;
}

function tachTheoChamPhay(s: string): string[] {
  const ra: string[] = [];
  let cur = '';
  let trongNgoac = false;
  for (const c of s) {
    if (c === '"') {
      trongNgoac = !trongNgoac;
      cur += c;
    } else if (c === ';' && !trongNgoac) {
      ra.push(cur);
      cur = '';
    } else cur += c;
  }
  ra.push(cur);
  return ra;
}

function boThoat(v: string): string {
  let ra = '';
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '\\' && i + 1 < v.length) {
      const n = v[++i];
      ra += n === 'n' || n === 'N' ? '\n' : n;
    } else ra += v[i];
  }
  return ra;
}

function emailTu(giaTri: string): string | null {
  const m = /mailto:([^\s;,]+)/i.exec(giaTri);
  return m ? m[1].toLowerCase() : giaTri.includes('@') ? giaTri.trim().toLowerCase() : null;
}

function dungSuKien(
  tho: Record<string, { thamSo: Record<string, string>; giaTri: string }>,
  khach: string[],
  nhac: number | null,
): SuKienNhap | null {
  const dt = tho['DTSTART'];
  if (!dt) return null;

  const canhBao: string[] = [];
  const batDau = docThoiDiem(dt.giaTri, dt.thamSo, canhBao);
  if (batDau === null) return null;

  const allDay = dt.thamSo['VALUE'] === 'DATE' || /^\d{8}$/.test(dt.giaTri.trim());

  let ketThuc: number | null = null;
  const de = tho['DTEND'];
  if (de) {
    ketThuc = docThoiDiem(de.giaTri, de.thamSo, canhBao);
  } else if (tho['DURATION']) {
    const ms = docThoiLuong(tho['DURATION'].giaTri);
    if (ms !== null) ketThuc = batDau + ms;
  }
  if (ketThuc === null) {
    // RFC: thiếu cả DTEND lẫn DURATION thì sự kiện có giờ được coi là dài 0,
    // còn sự kiện cả ngày dài 1 ngày. Giờ 0 phút thì database từ chối
    // (`end_at > start_at`), nên cho một mặc định hợp lý và nói rõ.
    ketThuc = batDau + (allDay ? 86_400_000 : 60 * 60_000);
    canhBao.push('No end time in the file — assumed ' + (allDay ? '1 day' : '1 hour') + '.');
  }
  if (ketThuc <= batDau) {
    ketThuc = batDau + (allDay ? 86_400_000 : 60 * 60_000);
    canhBao.push('End time was not after the start time — adjusted.');
  }

  const quyTac = tho['RRULE'] ? docRrule(tho['RRULE'].giaTri) : null;
  if (tho['RRULE'] && !quyTac) {
    canhBao.push('The repeat rule in this file is not supported — imported as a single event.');
  }

  return {
    quyTac,
    laLanLap: false,
    uid: tho['UID'] ? boThoat(tho['UID'].giaTri) : null,
    title: tho['SUMMARY'] ? boThoat(tho['SUMMARY'].giaTri).trim() : '(untitled event)',
    description: tho['DESCRIPTION'] ? boThoat(tho['DESCRIPTION'].giaTri) : null,
    location: tho['LOCATION'] ? boThoat(tho['LOCATION'].giaTri) : null,
    startAt: new Date(batDau).toISOString(),
    endAt: new Date(ketThuc).toISOString(),
    allDay,
    timeZone: dt.thamSo['TZID'] ?? null,
    remindMinutes: nhac,
    attendeeEmails: [...new Set(khach)],
    canhBao,
  };
}

/**
 * Một giá trị ngày-giờ của iCalendar → mốc mili-giây tuyệt đối.
 *
 * Ba dạng phải đỡ được:
 *   `20260901T073000Z`                        — đã là UTC
 *   `DTSTART;TZID=Asia/Ho_Chi_Minh:2026...`   — giờ tường của một múi giờ
 *   `20260901` (VALUE=DATE)                   — cả ngày
 */
function docThoiDiem(
  giaTri: string,
  thamSo: Record<string, string>,
  canhBao: string[],
): number | null {
  const v = giaTri.trim();

  const chiNgay = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (chiNgay) {
    const [, y, mo, d] = chiNgay;
    return new Date(Number(y), Number(mo) - 1, Number(d), 0, 0, 0, 0).getTime();
  }

  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m.map((x) => x);
  const so = (x: string) => Number(x);

  if (z) return Date.UTC(so(y), so(mo) - 1, so(d), so(h), so(mi), so(s));

  const tz = thamSo['TZID'];
  if (tz) {
    const t = tuGioTuong(so(y), so(mo), so(d), so(h), so(mi), so(s), tz);
    if (t !== null) return t;
    // Outlook ghi tên kiểu Windows ('Pacific Standard Time') chứ không phải
    // tên IANA, và `Intl` không hiểu. Đọc như giờ máy vẫn hơn là vứt cả sự
    // kiện — nhưng PHẢI nói ra, vì giờ có thể lệch.
    canhBao.push(`Unknown time zone "${tz}" — read as your local time, so the hour may be off.`);
  }

  // Không có TZID và không có Z = "giờ trôi nổi": RFC bảo hiểu theo giờ địa
  // phương của người đọc. `new Date(y, m, d, ...)` làm đúng như vậy.
  return new Date(so(y), so(mo) - 1, so(d), so(h), so(mi), so(s)).getTime();
}

/**
 * Giờ tường trong múi giờ `tz` → thời điểm tuyệt đối.
 *
 * Không có thư viện múi giờ nào trong dự án, nhưng `Intl` đã mang sẵn toàn bộ
 * cơ sở dữ liệu IANA. Cách làm: đoán một mốc, hỏi `Intl` xem mốc đó rơi vào
 * giờ tường nào ở `tz`, rồi bù phần lệch. Chạy hai vòng vì chính độ lệch cũng
 * đổi theo mùa — vòng một đưa ta tới gần đúng, vòng hai chốt lại.
 *
 * Trả `null` khi `Intl` không nhận ra tên múi giờ.
 */
function tuGioTuong(
  y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string,
): number | null {
  let doan = Date.UTC(y, mo - 1, d, h, mi, s);
  try {
    for (let i = 0; i < 2; i++) {
      const lech = lechPhut(doan, tz);
      const moi = Date.UTC(y, mo - 1, d, h, mi, s) - lech * 60_000;
      if (moi === doan) return doan;
      doan = moi;
    }
    return doan;
  } catch {
    return null; // tên múi giờ không hợp lệ
  }
}

/** Độ lệch (phút) của múi giờ `tz` so với UTC tại đúng thời điểm `utcMs`. */
function lechPhut(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const phan of dtf.formatToParts(new Date(utcMs))) {
    if (phan.type !== 'literal') p[phan.type] = Number(phan.value);
  }
  // Vài bản cài trả `24` cho lúc nửa đêm thay vì `0`.
  const gio = (p['hour'] ?? 0) % 24;
  const nhuUtc = Date.UTC(p['year'], p['month'] - 1, p['day'], gio, p['minute'], p['second']);
  return (nhuUtc - utcMs) / 60_000;
}

/** `PT1H30M`, `P1D`, `PT45M`, `P1W` → mili-giây. */
function docThoiLuong(v: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(
    v.trim(),
  );
  if (!m) return null;
  const [, dau, w, d, h, mi, s] = m;
  const ms =
    (Number(w ?? 0) * 7 * 86400 + Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 +
      Number(mi ?? 0) * 60 + Number(s ?? 0)) * 1000;
  if (ms === 0 && !/\d/.test(v)) return null;
  return dau === '-' ? -ms : ms;
}

/** `TRIGGER:-PT10M` → 10 (phút trước giờ họp). Trigger tuyệt đối thì bỏ qua. */
function nhacTuTrigger(v: string): number | null {
  const ms = docThoiLuong(v);
  if (ms === null) return null;
  // Số dương = nhắc SAU khi bắt đầu; app này chỉ nhắc trước nên bỏ.
  return ms < 0 ? Math.round(-ms / 60_000) : null;
}
