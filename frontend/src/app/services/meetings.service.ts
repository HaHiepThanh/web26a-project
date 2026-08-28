import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { Meeting, ParsedMeetingPdf } from '../models';

/** Thân request `POST /meetings` — khớp `CreateMeetingDto` phía backend. */
export interface TaoLichHopRequest {
  boardId: string;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  timeZone: string;
  remindMinutes: number;
  attendeeIds: string[];
  /** Quy tắc lặp dạng RRULE (không kèm tiền tố `RRULE:`). */
  recurrence?: string | null;
  /** Mốc bắt đầu của từng lần diễn ra, khi cuộc họp có lặp. */
  occurrences?: string[];
  googleEventId?: string | null;
  googleHtmlLink?: string | null;
  meetUrl?: string | null;
}

/** Cầu nối tới module `meetings` của backend. Không đụng gì tới Google. */
@Injectable({ providedIn: 'root' })
export class MeetingsService {
  private readonly api = inject(ApiService);

  /** Lưu bản sao cuộc họp VỪA tạo trên Google Calendar. */
  luu(req: TaoLichHopRequest): Promise<Meeting> {
    return this.api.post<Meeting>('/meetings', req);
  }

  /** Trích xuất dữ liệu cuộc họp từ file PDF xuất từ Google Calendar. */
  parsePdf(file: File): Promise<ParsedMeetingPdf> {
    const form = new FormData();
    form.append('file', file);
    return this.api.upload<ParsedMeetingPdf>('/meetings/parse-pdf', form);
  }
}
