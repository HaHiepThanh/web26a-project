import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { KetQuaHuyHop, Meeting, ParsedMeetingPdf, UpcomingMeeting } from '../models';

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
  googleEventId?: string | null;
  googleHtmlLink?: string | null;
  meetUrl?: string | null;
}

/** Cầu nối tới module `meetings` của backend. Không đụng gì tới Google. */
@Injectable({ providedIn: 'root' })
export class MeetingsService {
  private readonly api = inject(ApiService);

  /** Lịch sắp tới của một board. */
  danhSach(boardId: string): Promise<Meeting[]> {
    return this.api.get<Meeting[]>(`/meetings?boardId=${encodeURIComponent(boardId)}`);
  }

  /** Cuộc họp sắp tới của TÔI — nguồn cho lời nhắc ở chuông. */
  sapToiCuaToi(): Promise<UpcomingMeeting[]> {
    return this.api.get<UpcomingMeeting[]>('/meetings/my-upcoming');
  }

  /** Lưu bản sao cuộc họp VỪA tạo trên Google Calendar. */
  luu(req: TaoLichHopRequest): Promise<Meeting> {
    return this.api.post<Meeting>('/meetings', req);
  }

  huy(meetingId: string): Promise<KetQuaHuyHop> {
    return this.api.delete<KetQuaHuyHop>(`/meetings/${meetingId}`);
  }

  /** Trích xuất dữ liệu cuộc họp từ file PDF xuất từ Google Calendar. */
  parsePdf(file: File): Promise<ParsedMeetingPdf> {
    const form = new FormData();
    form.append('file', file);
    return this.api.upload<ParsedMeetingPdf>('/meetings/parse-pdf', form);
  }
}
