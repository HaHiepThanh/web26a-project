import { Injectable, inject } from '@angular/core';
import { GoogleOauthService } from './google-oauth.service';

/** Sự kiện tạo ra chỉ để lấy link Meet, nên cho nó ngắn và nằm ngay bây giờ. */
const THOI_LUONG_PHUT = 60;

interface KetQua {
  meetUrl?: string;
  error?: string;
}

/**
 * Tạo phòng Google Meet "họp ngay" cho một board.
 *
 * Phần liên kết tài khoản và xin token nằm ở `GoogleOauthService` — dùng chung
 * với `GoogleCalendarService`; xem ghi chú ở đó về việc vì sao gọi Google từ
 * trình duyệt chứ không qua backend.
 *
 * ─── VÌ SAO DÙNG CALENDAR API CHỨ KHÔNG PHẢI MEET API ───
 *
 * Meet API (`spaces.create`) tạo được phòng nhưng KHÔNG đặt được tên — Space
 * không có trường tiêu đề (đã tra tài liệu). Mà yêu cầu là cuộc họp phải mang
 * tên board. Chỉ Calendar API làm được: `summary` của sự kiện chính là cái tên
 * hiện trong Meet.
 */
@Injectable({ providedIn: 'root' })
export class GoogleMeetService {
  private readonly oauth = inject(GoogleOauthService);

  /** Tạo phòng họp mang tên board, bắt đầu ngay bây giờ. */
  async taoPhongHop(tenBoard: string): Promise<KetQua> {
    const { token, error } = await this.oauth.layToken();
    if (!token) return { error: error ?? 'Could not get Google permission.' };

    const batDau = new Date();
    const ketThuc = new Date(batDau.getTime() + THOI_LUONG_PHUT * 60_000);

    try {
      const res = await fetch(
        // `conferenceDataVersion=1` là BẮT BUỘC. Thiếu nó thì Google lặng lẽ bỏ
        // qua `conferenceData` — sự kiện vẫn tạo thành công nhưng KHÔNG có link
        // Meet nào, và ta chỉ phát hiện ở bước đọc kết quả.
        'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            summary: tenBoard,
            description: 'Created from Horizon Hub Harmony.',
            start: { dateTime: batDau.toISOString() },
            end: { dateTime: ketThuc.toISOString() },
            conferenceData: {
              createRequest: {
                // Google dùng chuỗi này để chống tạo trùng khi request bị gửi
                // lại — phải mới mỗi lần, nếu không nó trả về đúng phòng cũ.
                requestId: `hhh-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                conferenceSolutionKey: { type: 'hangoutsMeet' },
              },
            },
          }),
        },
      );

      if (!res.ok) return { error: this.oauth.doiLoiGoogle(res.status) };

      const data = (await res.json()) as {
        hangoutLink?: string;
        conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
      };

      // `hangoutLink` là đường tắt tiện nhất, nhưng không phải lúc nào cũng có;
      // `entryPoints` mới là nguồn chính thức. Thử cả hai rồi mới chịu thua.
      const link =
        data.hangoutLink ??
        data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri;

      if (!link) {
        return { error: 'Google created the event but returned no Meet link. Please try again.' };
      }
      return { meetUrl: link };
    } catch {
      return { error: 'Could not reach Google Calendar. Check your connection.' };
    }
  }
}
