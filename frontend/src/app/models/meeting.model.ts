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
}

/**
 * Một dòng `GET /meetings/my-upcoming` — cuộc họp sắp tới của TÔI.
 *
 * Nhẹ hơn `Meeting` vì chỉ phục vụ việc nhắc ở chuông: đủ để dựng câu thông báo
 * và bấm vào là tới đúng board.
 */
export interface UpcomingMeeting {
  id: string;
  boardId: string;
  boardName: string;
  orgSlug: string;
  title: string;
  startAt: string;
  remindMinutes: number;
  meetUrl: string | null;
}

/** Kết quả `DELETE /meetings/:id`. */
export interface KetQuaHuyHop {
  id: string;
  googleEventId: string | null;
  /**
   * Người vừa huỷ có xoá được sự kiện bên Google không.
   *
   * Chỉ đúng khi họ CHÍNH LÀ người tạo — Calendar API xoá theo lịch `primary`
   * của chủ token, người khác gọi sẽ nhận 404. `false` nghĩa là lịch bên Google
   * vẫn còn và giao diện phải nói thẳng điều đó.
   */
  xoaDuocTrenGoogle: boolean;
}
