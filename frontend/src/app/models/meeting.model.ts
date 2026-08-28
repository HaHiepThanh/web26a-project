/** Một người được mời dự họp. */
export interface MeetingAttendee {
  id: string;
  displayName: string | null;
  email: string;
  avatarUrl: string | null;
}

/** Một cuộc họp đã hẹn — hình dạng `GET /meetings?boardId=` trả về. */
export interface Meeting {
  id: string;
  boardId: string;
  title: string;
  description: string | null;
  /** ISO 8601, thời điểm tuyệt đối. */
  startAt: string;
  endAt: string;
  /** Múi giờ IANA người tạo đã chọn — dùng để hiển thị lại đúng như lúc đặt. */
  timeZone: string;
  remindMinutes: number;
  googleEventId: string | null;
  googleHtmlLink: string | null;
  meetUrl: string | null;
  createdBy: string | null;
  attendees: MeetingAttendee[];
  canceledAt: string | null;
  /** Quy tắc lặp dạng RRULE — chỉ buổi ĐẦU của chuỗi có giá trị. */
  recurrence: string | null;
}


/** Kết quả `DELETE /meetings/:id`. */

/** Dữ liệu trích xuất từ file PDF do Google Calendar xuất ra. */
export interface ParsedMeetingPdf {
  title: string;
  organizer: string | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  duration: number;
  timeZone: string | null;
  description: string | null;
  meetUrl: string | null;
  attendeeEmails: string[];
}
