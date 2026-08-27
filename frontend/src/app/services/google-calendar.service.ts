import { Injectable, inject } from '@angular/core';
import { GoogleOauthService } from './google-oauth.service';

const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

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
