/**
 * QUY TẮC LẶP (RRULE, RFC 5545 §3.8.5.3).
 *
 * Tách khỏi `ics.util.ts` vì nó có việc riêng và nhiều bẫy riêng: dựng chuỗi
 * quy tắc, đọc lại, và TRẢI quy tắc thành từng lần diễn ra cụ thể.
 *
 * ─── VÌ SAO PHẢI TRẢI RA THÀNH TỪNG LẦN ───
 *
 * Bộ nhắc của app (`MeetingReminderService`) đặt hẹn giờ theo `start_at` — một
 * mốc thời gian CỤ THỂ. Nó không biết đọc quy tắc lặp. Nên một cuộc họp "mỗi
 * thứ Hai" phải được trải thành từng dòng riêng thì chuông mới kêu đúng từng
 * tuần. Quy tắc gốc vẫn được giữ lại để xuất ra `.ics` cho đúng, và để hiển thị.
 */

export type TanSuat = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export const TAN_SUAT: { id: TanSuat | ''; nhan: string }[] = [
  { id: '', nhan: 'Does not repeat' },
  { id: 'DAILY', nhan: 'Every day' },
  { id: 'WEEKLY', nhan: 'Every week' },
  { id: 'MONTHLY', nhan: 'Every month' },
  { id: 'YEARLY', nhan: 'Every year' },
];

export interface QuyTacLap {
  freq: TanSuat;
  /** Cách mấy kỳ một lần. 2 + WEEKLY = hai tuần một lần. Mặc định 1. */
  interval?: number;
  /** Lặp bao nhiêu lần TẤT CẢ (kể cả lần đầu). Loại trừ nhau với `until`. */
  count?: number;
  /** Lặp tới hết ngày này (ISO). Loại trừ nhau với `count`. */
  until?: string;
}

/**
 * Trần số lần trải ra.
 *
 * Một quy tắc "mỗi ngày" không có điểm dừng là vô hạn. Không chặn thì một dòng
 * trong file .ics đẻ ra hàng nghìn bản ghi và hàng nghìn lời nhắc.
 */
export const TOI_DA_LAN = 200;

/** `QuyTacLap` → chuỗi `RRULE:` để nhét vào .ics và gửi cho Google. */
export function taoRrule(q: QuyTacLap | null): string | null {
  if (!q?.freq) return null;
  const phan = [`FREQ=${q.freq}`];
  if (q.interval && q.interval > 1) phan.push(`INTERVAL=${Math.floor(q.interval)}`);
  if (q.count && q.count > 0) {
    phan.push(`COUNT=${Math.floor(q.count)}`);
  } else if (q.until) {
    // UNTIL phải là mốc UTC có hậu tố Z khi DTSTART là dạng UTC — trộn hai
    // dạng là file không hợp lệ và Apple Calendar từ chối cả sự kiện.
    phan.push(`UNTIL=${utc(new Date(q.until))}`);
  }
  return `RRULE:${phan.join(';')}`;
}

/** Đọc ngược một dòng `RRULE:...`. Trả `null` nếu không hiểu được. */
export function docRrule(dong: string): QuyTacLap | null {
  const than = dong.replace(/^RRULE:/i, '').trim();
  if (!than) return null;

  const p: Record<string, string> = {};
  for (const manh of than.split(';')) {
    const i = manh.indexOf('=');
    if (i > 0) p[manh.slice(0, i).toUpperCase()] = manh.slice(i + 1);
  }

  const freq = (p['FREQ'] ?? '').toUpperCase() as TanSuat;
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null;

  const q: QuyTacLap = { freq };
  const interval = Number(p['INTERVAL']);
  if (Number.isFinite(interval) && interval > 1) q.interval = interval;

  const count = Number(p['COUNT']);
  if (Number.isFinite(count) && count > 0) q.count = count;
  else if (p['UNTIL']) {
    const d = docUtc(p['UNTIL']);
    if (d) q.until = d.toISOString();
  }
  return q;
}

/**
 * Trải quy tắc thành danh sách mốc bắt đầu cụ thể.
 *
 * Lần đầu tiên LUÔN nằm trong kết quả — RFC coi `DTSTART` là lần diễn ra thứ
 * nhất, `COUNT=3` nghĩa là ba lần TẤT CẢ chứ không phải ba lần lặp thêm.
 *
 * @param batDau  mốc bắt đầu của lần đầu
 * @param q       quy tắc; `null` = không lặp, trả về đúng một mốc
 * @param tran    chặn trên nếu quy tắc không có điểm dừng
 */
export function traiQuyTac(
  batDau: Date,
  q: QuyTacLap | null,
  tran = TOI_DA_LAN,
): Date[] {
  if (!q?.freq) return [new Date(batDau)];

    const buoc = Math.max(1, Math.floor(q.interval ?? 1));
  const hetHan = q.until ? new Date(q.until).getTime() : null;
  const soLan = q.count && q.count > 0 ? Math.min(q.count, tran) : tran;

  const ra: Date[] = [];
  for (let i = 0; i < soLan; i++) {
    const d = congKy(batDau, q.freq, buoc * i);
    if (hetHan !== null && d.getTime() > hetHan) break;
    ra.push(d);
  }
  return ra;
}

/**
 * Cộng thêm `n` kỳ vào một mốc.
 *
 * ⚠️ Với MONTHLY và YEARLY, `Date` của JS TỰ TRÀN sang tháng sau khi ngày đích
 *    không tồn tại: đặt ngày 31 vào tháng 2 sẽ ra ngày 3 tháng 3. Một cuộc họp
 *    "ngày 31 hằng tháng" mà nhảy sang mùng 3 là sai hẳn ngày.
 *
 *    RFC 5545 bảo BỎ QUA những kỳ không có ngày đó. Nên ở đây phát hiện tràn
 *    rồi kẹp về ngày cuối tháng — giữ đúng tháng, chỉ lệch trong phạm vi tháng
 *    đó, dễ hiểu hơn nhiều so với việc biến mất hoặc nhảy tháng.
 */
function congKy(goc: Date, freq: TanSuat, n: number): Date {
  const d = new Date(goc.getTime());
  if (freq === 'DAILY') {
    d.setDate(d.getDate() + n);
    return d;
  }
  if (freq === 'WEEKLY') {
    d.setDate(d.getDate() + n * 7);
    return d;
  }

  const ngayGoc = goc.getDate();
  if (freq === 'MONTHLY') d.setMonth(d.getMonth() + n, 1);
  else d.setFullYear(d.getFullYear() + n, goc.getMonth(), 1);

  // Đặt về mùng 1 trước rồi mới kẹp ngày: làm vậy phép `setMonth` không có cơ
  // hội tràn, và ta tự quyết ngày cuối cùng.
  const soNgayTrongThang = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(ngayGoc, soNgayTrongThang));
  return d;
}

/** Câu mô tả quy tắc cho người đọc. */
export function moTaQuyTac(q: QuyTacLap | null): string {
  if (!q?.freq) return 'Does not repeat';
  const n = Math.max(1, Math.floor(q.interval ?? 1));
  const donVi: Record<TanSuat, string> = {
    DAILY: 'day',
    WEEKLY: 'week',
    MONTHLY: 'month',
    YEARLY: 'year',
  };
  const nhip = n === 1 ? `Every ${donVi[q.freq]}` : `Every ${n} ${donVi[q.freq]}s`;
  if (q.count) return `${nhip}, ${q.count} times`;
  if (q.until) {
    const d = new Date(q.until);
    return `${nhip}, until ${d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}`;
  }
  return nhip;
}

function utc(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

function docUtc(v: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(v.trim());
  if (!m) return null;
  const n = (x: string | undefined) => Number(x ?? 0);
  return new Date(
    Date.UTC(n(m[1]), n(m[2]) - 1, n(m[3]), n(m[4]), n(m[5]), n(m[6])),
  );
}
