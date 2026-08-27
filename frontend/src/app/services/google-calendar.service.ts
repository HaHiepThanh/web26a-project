import { Injectable, inject } from '@angular/core';
import { GoogleOauthService } from './google-oauth.service';

const API_BASE = 'https://www.googleapis.com/calendar/v3/calendars';
/** Tạo/xoá luôn ghi vào lịch CHÍNH của người đang đăng nhập. */
const API = `${API_BASE}/primary/events`;

export interface KhachMoi {
  email: string;
  /** Người chưa nối Google vẫn nhận được MAIL mời, chỉ là lịch không tự vào
   *  Google Calendar của họ nếu email đó không phải tài khoản Google. */
  optional?: boolean;
}

export interface YeuCauTaoLich {
  title: string;
  description?: string | null;
  /** ISO 8601, thời điểm tuyệt đối. */
  startAt: string;
  endAt: string;
  /** Múi giờ IANA, ví dụ 'Asia/Ho_Chi_Minh'. */
  timeZone: string;
  /** 0 = không nhắc. Google nhắc bằng popup + mail; chuông trong app là việc riêng. */
  remindMinutes: number;
  khach: KhachMoi[];
  /** Có kèm phòng Google Meet cho cuộc họp này không. */
  kemMeet: boolean;
  /** Dòng `RRULE:...` nếu cuộc họp lặp lại. */
  rrule?: string | null;
}

export interface KetQuaTaoLich {
  googleEventId?: string;
  googleHtmlLink?: string;
  meetUrl?: string;
  error?: string;
}

/**
 * HẸN LỊCH HỌP trên Google Calendar, có mời người và gửi mail.
 *
 * ─── VÌ SAO KHÔNG CẦN HẠ TẦNG GỬI MAIL NÀO ───
 *
 * `sendUpdates=all` bảo Google tự gửi thư mời — đúng lá thư Google Calendar quen
 * thuộc, có nút Yes/No/Maybe, và người nhận bấm đồng ý thì lịch vào thẳng Google
 * Calendar của họ. Ta không đụng tới SMTP, không giữ danh sách mail nào.
 *
 * ⚠️ MẶC ĐỊNH CỦA API LÀ **KHÔNG GỬI**. Thiếu `sendUpdates=all` thì sự kiện vẫn
 *    tạo thành công, danh sách khách vẫn đúng, mà KHÔNG một ai nhận được thư —
 *    và không có lỗi nào báo. Đúng loại bẫy như `conferenceDataVersion=1`.
 *
 * ─── VÌ SAO KHÔNG ĐỌC NGƯỢC TRẠNG THÁI NHẬN LỜI ───
 *
 * Người ta bấm Yes/No BÊN GOOGLE, và Google không báo về đây. Muốn biết thì
 * phải đọc lại sự kiện bằng token OAuth của người tạo — token sống ~1 giờ và
 * chỉ nằm trong tab của họ. Một cột "đã nhận lời" sẽ đúng lúc mới tạo rồi sai
 * vĩnh viễn, tệ hơn là không có. Người tổ chức xem ở Google Calendar, nơi nó
 * luôn đúng.
 */
@Injectable({ providedIn: 'root' })
export class GoogleCalendarService {
  private readonly oauth = inject(GoogleOauthService);

  async taoLichHop(yc: YeuCauTaoLich): Promise<KetQuaTaoLich> {
    const { token, error } = await this.oauth.layToken();
    if (!token) return { error: error ?? 'Could not get Google permission.' };

    const body: Record<string, unknown> = {
      summary: yc.title,
      description: yc.description?.trim() || 'Scheduled from Horizon Hub Harmony.',
      // Gửi kèm `timeZone` chứ không chỉ mỗi ISO: Google hiển thị lại sự kiện
      // theo múi giờ này cho người tổ chức, và dùng nó khi cuộc họp lặp lại qua
      // mốc đổi giờ mùa.
      start: { dateTime: yc.startAt, timeZone: yc.timeZone },
      end: { dateTime: yc.endAt, timeZone: yc.timeZone },
      attendees: yc.khach.map((k) => ({ email: k.email, optional: k.optional ?? false })),
      reminders: {
        // `useDefault: false` là bắt buộc để `overrides` có tác dụng — để `true`
        // thì Google dùng mặc định của lịch người đó và bỏ qua phần dưới.
        useDefault: false,
        overrides:
          yc.remindMinutes > 0
            ? [
                { method: 'popup', minutes: yc.remindMinutes },
                { method: 'email', minutes: yc.remindMinutes },
              ]
            : [],
      },
    };

    if (yc.rrule) {
      // Google tự hiểu quy tắc lặp và tạo CẢ CHUỖI, chỉ gửi MỘT thư mời phủ
      // mọi lần diễn ra. Tự trải rồi tạo N sự kiện riêng sẽ bắn N thư mời vào
      // hộp thư người nhận — và họ phải trả lời từng cái.
      //
      // `recurrence` là MẢNG chuỗi, mỗi chuỗi có tiền tố đầy đủ ('RRULE:...').
      body['recurrence'] = [
        yc.rrule.startsWith('RRULE:') ? yc.rrule : `RRULE:${yc.rrule}`,
      ];
    }

    if (yc.kemMeet) {
      body['conferenceData'] = {
        createRequest: {
          requestId: `hhh-lich-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    try {
      const res = await fetch(`${API}?conferenceDataVersion=1&sendUpdates=all`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) return { error: this.oauth.doiLoiGoogle(res.status) };

      const data = (await res.json()) as {
        id?: string;
        htmlLink?: string;
        hangoutLink?: string;
        conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
      };

      const meetUrl =
        data.hangoutLink ??
        data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri;

      return {
        googleEventId: data.id,
        googleHtmlLink: data.htmlLink,
        // Không có link Meet KHÔNG phải lỗi ở đây (khác `taoPhongHop`): người
        // dùng có thể cố ý hẹn một cuộc họp trực tiếp, không cần phòng online.
        meetUrl,
      };
    } catch {
      return { error: 'Could not reach Google Calendar. Check your connection.' };
    }
  }

  /**
   * Đọc một sự kiện từ Google Calendar theo link người dùng dán vào.
   *
   * Cần token OAuth vì link chỉ mang định danh, không mang nội dung — xem ghi
   * chú ở `tachLinkGoogle`. Người dán phải CÓ QUYỀN XEM lịch đó; lịch của người
   * khác sẽ trả 404.
   */
  async docTheoLink(url: string): Promise<{ suKien?: SuKienGoogle; error?: string }> {
    const ma = tachLinkGoogle(url);
    if (!ma) {
      return {
        error:
          'That does not look like a Google Calendar event link. Open the event in Google Calendar, use “Publish event” or copy the link from the address bar, then paste it here.',
      };
    }

    const { token, error } = await this.oauth.layToken();
    if (!token) return { error: error ?? 'Could not get Google permission.' };

    try {
      const res = await fetch(
        `${API_BASE}/${encodeURIComponent(ma.calendarId)}/events/${encodeURIComponent(ma.eventId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.status === 404) {
        return {
          error:
            'That event was not found in your Google Calendar. You can only import events from a calendar you have access to.',
        };
      }
      if (!res.ok) return { error: this.oauth.doiLoiGoogle(res.status) };

      const d = (await res.json()) as {
        summary?: string;
        description?: string;
        start?: { dateTime?: string; date?: string; timeZone?: string };
        end?: { dateTime?: string; date?: string; timeZone?: string };
        hangoutLink?: string;
        location?: string;
        attendees?: { email?: string }[];
        status?: string;
      };

      if (d.status === 'cancelled') {
        return { error: 'That event has been cancelled in Google Calendar.' };
      }

      // Sự kiện cả ngày dùng `date` (không giờ); sự kiện thường dùng `dateTime`.
      const allDay = !d.start?.dateTime;
      const batDau = d.start?.dateTime ?? (d.start?.date ? `${d.start.date}T00:00:00` : null);
      const ketThuc = d.end?.dateTime ?? (d.end?.date ? `${d.end.date}T00:00:00` : null);
      if (!batDau) return { error: 'That event has no start time.' };

      const b = new Date(batDau);
      // Thiếu giờ kết thúc thì cho mặc định 1 giờ — database từ chối độ dài 0.
      const k = ketThuc ? new Date(ketThuc) : new Date(b.getTime() + 60 * 60_000);

      return {
        suKien: {
          title: d.summary?.trim() || '(untitled event)',
          description: lamSachHtml(d.description ?? '') || null,
          startAt: b.toISOString(),
          endAt: (k > b ? k : new Date(b.getTime() + 60 * 60_000)).toISOString(),
          timeZone: d.start?.timeZone ?? null,
          meetUrl:
            d.hangoutLink ??
            /https:\/\/meet\.google\.com\/[A-Za-z0-9-]+/.exec(d.location ?? '')?.[0] ??
            null,
          attendeeEmails: (d.attendees ?? [])
            .map((a) => (a.email ?? '').toLowerCase())
            .filter(Boolean),
          allDay,
        },
      };
    } catch {
      return { error: 'Could not reach Google Calendar. Check your connection.' };
    }
  }

  /**
   * Xoá sự kiện khỏi Google Calendar và báo huỷ cho khách.
   *
   * ⚠️ CHỈ NGƯỜI TẠO gọi được — Calendar API xoá theo lịch `primary` của chủ
   *    token, nên người khác gọi sẽ nhận 404 (sự kiện không nằm trong lịch của
   *    họ). Vì thế backend trả kèm cờ `xoaDuocTrenGoogle` để giao diện biết khi
   *    nào nên gọi hàm này, và khi nào phải nói thẳng với người dùng rằng lịch
   *    bên Google vẫn còn.
   */
  async xoaLichHop(googleEventId: string): Promise<string | null> {
    const { token, error } = await this.oauth.layToken();
    if (!token) return error ?? 'Could not get Google permission.';

    try {
      const res = await fetch(
        `${API}/${encodeURIComponent(googleEventId)}?sendUpdates=all`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      );
      // 410 = đã xoá từ trước. Với người dùng thì kết quả giống hệt xoá thành
      // công, nên đừng dựng lên một lỗi không có việc gì để làm tiếp.
      if (res.ok || res.status === 410) return null;
      return this.oauth.doiLoiGoogle(res.status);
    } catch {
      return 'Could not reach Google Calendar. Check your connection.';
    }
  }
}

/** Một sự kiện đọc được từ Google Calendar. */
export interface SuKienGoogle {
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  timeZone: string | null;
  meetUrl: string | null;
  attendeeEmails: string[];
  allDay: boolean;
}

/**
 * Tách `calendarId` + `eventId` ra khỏi một đường link Google Calendar.
 *
 * ⚠️ ĐƯỜNG LINK KHÔNG CHỨA DỮ LIỆU SỰ KIỆN. Nó chỉ mang ĐỊNH DANH:
 *
 *     ?action=TEMPLATE&tmeid=<base64>&tmsrc=<email lịch>
 *
 * `tmeid` giải base64 ra `"<eventId> <calendarId rút gọn>"` — có mã sự kiện
 * nhưng không có tên, giờ, hay người dự. Muốn biết nội dung thì BẮT BUỘC phải
 * gọi Calendar API; không có cách nào đọc được từ chính chuỗi link.
 *
 * Dùng `tmsrc` làm calendarId vì phần trong `tmeid` bị cắt cụt
 * (`hahiepthanhhhtt@m` thay vì `...@gmail.com`).
 */
export function tachLinkGoogle(
  url: string,
): { calendarId: string; eventId: string } | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (!/(^|\.)google\.com$/i.test(u.hostname)) return null;

  // Google dùng `eid` ở link chia sẻ thường và `tmeid` ở link TEMPLATE.
  const ma = u.searchParams.get('tmeid') ?? u.searchParams.get('eid');
  if (!ma) return null;

  let giai: string;
  try {
    // base64url: đổi ký tự và bù dấu `=` cho đủ bội số 4.
    const chuan = ma.replace(/-/g, '+').replace(/_/g, '/');
    giai = atob(chuan + '='.repeat((4 - (chuan.length % 4)) % 4));
  } catch {
    return null;
  }

  const [eventId, lichRutGon] = giai.split(' ');
  if (!eventId) return null;

  const calendarId = u.searchParams.get('tmsrc') ?? lichRutGon ?? 'primary';
  return { calendarId, eventId };
}

/** Mô tả của Google là HTML — gỡ thẻ ra, nếu không người dùng thấy nguyên thẻ. */
function lamSachHtml(v: string): string {
  return v
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
