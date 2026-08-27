import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import ical from 'node-ical';
import type { CalendarResponse, VEvent } from 'node-ical';

/**
 * ĐỌC FILE .ics — dùng thư viện, KHÔNG tự viết luật lặp.
 *
 * ─── VÌ SAO KHÔNG TỰ VIẾT ───
 *
 * Bản trước tự cài luật lặp của RFC 5545 ở frontend. Đo trên hai file thật do
 * Google và Apple xuất ra thì hỏng ở bốn chỗ, và cả bốn đều im lặng:
 *
 *   • `BYDAY`         — có ở 14/15 quy tắc, bị bỏ qua hoàn toàn.
 *                       Chạy đúng chỉ vì file toàn BYDAY một ngày trùng thứ của
 *                       DTSTART; gặp `BYDAY=MO,WE,FR` là mất 2/3 số buổi.
 *   • `RECURRENCE-ID` — 6 cái mỗi file. Đây là NGOẠI LỆ của chuỗi (một buổi bị
 *                       dời giờ), nhưng bị đếm thành sự kiện độc lập CỘNG THÊM
 *                       buổi do quy tắc sinh ra → nhân đôi.
 *   • `RDATE`         — 3 cái trong file Apple, bỏ qua.
 *   • quy tắc vô hạn  — một `FREQ=DAILY` không điểm dừng làm 30 sự kiện nở
 *                       thành hơn 100 rồi chạm trần, mất dữ liệu không báo.
 *
 * `node-ical` xử lý cả bốn. Cùng hai file đó, nó cho ra **24 sự kiện thật** —
 * đúng con số sau khi đã gộp 6 ngoại lệ vào chuỗi cha.
 *
 * ─── VÌ SAO Ở BACKEND, KHÔNG Ở FRONTEND ───
 *
 * Bundle frontend đã vượt ngân sách 189KB nên không gánh thêm được thư viện;
 * và đằng nào cũng cần một bộ đọc duy nhất thay vì hai bản dễ lệch nhau.
 * Chiều NGƯỢC LẠI (dựng file .ics để tải về) vẫn ở frontend: dựng dễ hơn đọc
 * rất nhiều, và dữ liệu là do chính app sinh ra nên không có mấy ca hiểm này.
 */

/** Trần số sự kiện trả về một lần đọc. */
export const TOI_DA_SU_KIEN = 200;

/**
 * Trần cho quy tắc lặp KHÔNG có điểm dừng.
 *
 * `FREQ=DAILY` không kèm `UNTIL`/`COUNT` là vô hạn. Phải chặn ở đâu đó, và hai
 * năm kể từ buổi đầu là đủ rộng cho mọi lịch học/lịch họp thực tế.
 */
const TRAN_NAM = 2;

export interface SuKienDoc {
  uid: string | null;
  title: string;
  description: string | null;
  location: string | null;
  /** ISO 8601, thời điểm tuyệt đối. */
  startAt: string;
  endAt: string;
  allDay: boolean;
  timeZone: string | null;
  attendeeEmails: string[];
  /** Link Google Meet đọc được từ sự kiện, nếu có. */
  meetUrl: string | null;
  /** Buổi này sinh ra từ một quy tắc lặp. */
  laLanLap: boolean;
  /** Buổi này là NGOẠI LỆ của chuỗi — đã bị dời giờ hoặc sửa riêng. */
  laNgoaiLe: boolean;
  canhBao: string[];
}

export interface KetQuaDoc {
  suKien: SuKienDoc[];
  /** Số sự kiện bị cắt vì chạm trần — nói ra thay vì âm thầm mất. */
  soBiCat: number;
  /** Khoảng thời gian đã dùng để trải quy tắc lặp, trả lại để giao diện hiện. */
  tuNgay: string;
  denNgay: string;
}

@Injectable()
export class IcsParserService {
  private readonly logger = new Logger(IcsParserService.name);

  doc(noiDung: string, tuNgay?: string | null, denNgay?: string | null): KetQuaDoc {
    if (!noiDung?.trim()) {
      throw new BadRequestException('The file is empty.');
    }
    // Kiểm bằng regex chứ không `startsWith`: file thật hay có BOM hoặc dòng trống.
    if (!/BEGIN:VCALENDAR/i.test(noiDung)) {
      throw new BadRequestException(
        'This is not a calendar file. Export an .ics file from Apple Calendar or Google Calendar and try again.',
      );
    }

    let tho: CalendarResponse;
    try {
      tho = ical.parseICS(noiDung);
    } catch (e) {
      this.logger.warn(`Đọc .ics thất bại: ${(e as Error).message}`);
      throw new BadRequestException(
        'This calendar file could not be read. It may be damaged or in an unsupported format.',
      );
    }

    const goc = Object.values(tho).filter(
      (v): v is VEvent => (v as { type?: string })?.type === 'VEVENT',
    );
    if (goc.length === 0) {
      throw new BadRequestException('This calendar file contains no events.');
    }

    // KHÔNG chọn khoảng thì lấy khoảng CỦA CHÍNH FILE, không phải "từ hôm nay".
    //
    // ⚠️ Đây từng là một lỗi thật và rất khó thấy: mặc định cũ bắt đầu từ hôm
    //    nay, nên một lịch đặt từ 26/8 mà hôm nay đã là 27/8 thì buổi đầu tiên
    //    lặng lẽ biến mất — người dùng đếm ra 35 buổi thay vì 36 và không có
    //    cách nào biết vì sao. Nhập file nghĩa là "lấy những gì trong file",
    //    không phải "lấy những gì còn ở tương lai".
    const { tu, den } = this.khoangDoc(goc, tuNgay, denNgay);

    const ra: SuKienDoc[] = [];
    for (const ev of goc) {
      // Buổi đã huỷ vẫn nằm trong file để trình lịch biết mà xoá đi — nhập nó
      // vào là dựng lại một cuộc họp người ta đã huỷ.
      if (String(ev.status ?? '').toUpperCase() === 'CANCELLED') continue;

      try {
        for (const lan of this.traiSuKien(ev, tu, den)) ra.push(lan);
      } catch (e) {
        // Một sự kiện hỏng KHÔNG được kéo đổ cả file.
        this.logger.warn(`Bỏ qua một sự kiện không đọc được: ${(e as Error).message}`);
      }
    }

    // Sắp xếp PHẢI xác định: nhiều buổi trùng giờ là chuyện thường (lịch học
    // có hai môn cùng khung), và nếu chỉ so mốc bắt đầu thì cùng một lịch xuất
    // ra từ Google với từ Apple lại cho hai thứ tự khác nhau. Phá hoà bằng tiêu
    // đề rồi tới uid để kết quả luôn lặp lại được.
    ra.sort(
      (a, b) =>
        a.startAt.localeCompare(b.startAt) ||
        a.title.localeCompare(b.title) ||
        (a.uid ?? '').localeCompare(b.uid ?? ''),
    );
    const soBiCat = Math.max(0, ra.length - TOI_DA_SU_KIEN);

    return {
      suKien: ra.slice(0, TOI_DA_SU_KIEN),
      soBiCat,
      tuNgay: chuoiNgay(tu),
      denNgay: chuoiNgay(den),
    };
  }

  // ------------------------------------------------------------------ nội bộ

  /**
   * Khoảng thời gian để trải quy tắc lặp.
   *
   * Người dùng chọn thì theo họ; không chọn thì suy từ chính file — buổi sớm
   * nhất tới điểm dừng muộn nhất, chặn trên bằng `TRAN_NAM` cho những quy tắc
   * vô hạn.
   */
  private khoangDoc(
    ds: VEvent[],
    tuNgay?: string | null,
    denNgay?: string | null,
  ): { tu: Date; den: Date } {
    const moc = ds
      .map((e) => (e.start as Date | undefined)?.getTime())
      .filter((t): t is number => !!t && !Number.isNaN(t));

    const somNhat = moc.length ? Math.min(...moc) : Date.now();
    const tu = tuNgay ? new Date(`${tuNgay}T00:00:00`) : new Date(somNhat);

    let den: Date;
    if (denNgay) {
      // Hết ngày, không phải đầu ngày: chọn "đến 30/9" mà cắt ở 00:00 là mất
      // sạch những buổi trong chính ngày 30.
      den = new Date(`${denNgay}T23:59:59.999`);
    } else {
      const muonNhat = ds.reduce((max, e) => {
        const ket = (e.end as Date | undefined)?.getTime();
        // `rrule.options.until` là điểm dừng của chuỗi lặp; không có thì chuỗi
        // vô hạn và sẽ bị trần năm chặn lại bên dưới.
        const until = (e.rrule as { options?: { until?: Date | null } } | undefined)
          ?.options?.until?.getTime();
        return Math.max(max, ket ?? 0, until ?? 0);
      }, 0);

      const tran = new Date(tu);
      tran.setFullYear(tran.getFullYear() + TRAN_NAM);
      den = new Date(Math.min(muonNhat || tran.getTime(), tran.getTime()));
      // Ôm trọn ngày cuối cùng.
      den.setHours(23, 59, 59, 999);
    }

    if (Number.isNaN(tu.getTime()) || Number.isNaN(den.getTime()) || den <= tu) {
      throw new BadRequestException('The date range is not valid.');
    }
    return { tu, den };
  }

  /**
   * Một VEVENT → những lần diễn ra nằm trong khoảng.
   *
   * `expandRecurringEvent` của thư viện lo trọn phần khó: áp `BYDAY`/`BYMONTHDAY`,
   * thay buổi bị `RECURRENCE-ID` sửa riêng, và loại những ngày trong `EXDATE`.
   */
  private traiSuKien(ev: VEvent, tu: Date, den: Date): SuKienDoc[] {
    if (!ev.rrule) {
      const batDau = ev.start as Date | undefined;
      if (!batDau || Number.isNaN(batDau.getTime())) return [];
      if (batDau < tu || batDau > den) return [];
      return [this.doiSang(ev, batDau, ev.end as Date | undefined, false, false)];
    }

    const lan = ical.expandRecurringEvent(ev, {
      from: tu,
      to: den,
      includeOverrides: true,
      excludeExdates: true,
    });
    return lan.map((l) =>
      this.doiSang(l.event ?? ev, l.start, l.end, l.isRecurring, l.isOverride),
    );
  }

  private doiSang(
    ev: VEvent,
    batDau: Date,
    ketThuc: Date | undefined,
    laLanLap: boolean,
    laNgoaiLe: boolean,
  ): SuKienDoc {
    const canhBao: string[] = [];

    let k = ketThuc;
    if (!k || Number.isNaN(k.getTime()) || k.getTime() <= batDau.getTime()) {
      // RFC: thiếu DTEND thì sự kiện có giờ dài 0. Database có
      // `check (end_at > start_at)` nên độ dài 0 không lưu được — cho một mặc
      // định hợp lý và nói rõ đã đoán.
      k = new Date(batDau.getTime() + 60 * 60_000);
      canhBao.push('No end time in the file — assumed 1 hour.');
    }

    const moTa = lamSachMoTa(chuoi(ev.description));
    const diaDiem = chuoi(ev.location);
    // Google nhét link Meet vào X-GOOGLE-CONFERENCE; Apple giữ nó trong mô tả
    // hoặc LOCATION. Tìm cả ba chỗ.
    const meetUrl =
      timLinkMeet(chuoi((ev as Record<string, unknown>)['X-GOOGLE-CONFERENCE'])) ??
      timLinkMeet(diaDiem) ??
      timLinkMeet(moTa);

    const allDay = (ev.datetype as string) === 'date';

    return {
      uid: chuoi(ev.uid) || null,
      title: chuoi(ev.summary).trim() || '(untitled event)',
      description: moTa || null,
      location: diaDiem || null,
      startAt: batDau.toISOString(),
      endAt: k.toISOString(),
      allDay,
      timeZone: (batDau as unknown as { tz?: string }).tz ?? null,
      attendeeEmails: docKhachMoi(ev),
      meetUrl,
      laLanLap,
      laNgoaiLe,
      canhBao,
    };
  }
}

/** Giá trị của node-ical có thể là chuỗi hoặc object `{val, params}`. */
function chuoi(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'val' in v) return String((v as { val: unknown }).val ?? '');
  return v == null ? '' : String(v);
}

/**
 * Mô tả của Google là HTML (`<p dir="ltr">Hello</p>`).
 *
 * Nhập thẳng vào là người dùng thấy nguyên thẻ trong ô mô tả cuộc họp.
 */
function lamSachMoTa(v: string): string {
  if (!v) return '';
  return v
    // Thẻ xuống dòng thành xuống dòng thật, trước khi gỡ mọi thẻ khác.
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Chỉ nhận link Meet — cột `meet_url` được DTO ghim đúng host này. */
function timLinkMeet(v: string): string | null {
  const m = /https:\/\/meet\.google\.com\/[A-Za-z0-9-]+/.exec(v ?? '');
  return m ? m[0] : null;
}

function docKhachMoi(ev: VEvent): string[] {
  const tho = (ev as Record<string, unknown>)['attendee'];
  const ds = Array.isArray(tho) ? tho : tho ? [tho] : [];
  const ra = new Set<string>();
  for (const a of ds) {
    const v =
      typeof a === 'string'
        ? a
        : String((a as { val?: unknown })?.val ?? (a as { params?: { CN?: string } })?.params?.CN ?? '');
    const m = /mailto:([^\s;,]+)/i.exec(v);
    if (m) ra.add(m[1].toLowerCase());
    else if (v.includes('@')) ra.add(v.trim().toLowerCase());
  }
  return [...ra];
}

function chuoiNgay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
