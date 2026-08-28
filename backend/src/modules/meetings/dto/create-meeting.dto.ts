import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Một cuộc họp vừa được tạo trên Google Calendar, gửi xuống để lưu bản sao.
 *
 * ⚠️ MỌI TRƯỜNG Ở ĐÂY ĐỀU LÀ DỮ LIỆU KHÔNG TIN ĐƯỢC. Sự kiện được tạo NGAY
 *    TRONG TRÌNH DUYỆT (xem google-calendar.service.ts), nên client là nơi
 *    dựng nên toàn bộ payload này. Service phải kiểm lại quyền và lọc lại danh
 *    sách người dự — không được tin `attendeeIds` gửi lên.
 */
export class CreateMeetingDto {
  @IsString({ message: 'boardId must be text.' })
  boardId!: string;

  @IsString({ message: 'title must be text.' })
  @MaxLength(200, { message: 'title cannot exceed 200 characters.' })
  title!: string;

  @IsOptional()
  @IsString({ message: 'description must be text.' })
  @MaxLength(2000, { message: 'description cannot exceed 2000 characters.' })
  description?: string | null;

  @IsISO8601({}, { message: 'startAt must be an ISO 8601 timestamp.' })
  startAt!: string;

  @IsISO8601({}, { message: 'endAt must be an ISO 8601 timestamp.' })
  endAt!: string;

  /**
   * Múi giờ IANA ('Asia/Ho_Chi_Minh'). Chặn bằng regex thay vì nhận chuỗi tự
   * do: giá trị này đi thẳng vào Google Calendar API, và cột `time_zone` được
   * đọc lại để hiển thị. Cho phép cả 'UTC' (không có dấu '/').
   */
  @Matches(/^[A-Za-z][A-Za-z0-9+_-]*(\/[A-Za-z0-9+_-]+)*$/, {
    message: 'timeZone must be an IANA time zone such as Asia/Ho_Chi_Minh.',
  })
  @MaxLength(64, { message: 'timeZone is too long.' })
  timeZone!: string;

  /** 0 = không nhắc. Trần 1440 phút (1 ngày) khớp check constraint ở database. */
  @IsInt({ message: 'remindMinutes must be a whole number.' })
  @Min(0, { message: 'remindMinutes cannot be negative.' })
  @Max(1440, { message: 'remindMinutes cannot exceed 1440 (one day).' })
  remindMinutes!: number;

  /** Firebase uid của người được mời — KHÔNG phải uuid. Service lọc lại. */
  @IsArray({ message: 'attendeeIds must be a list.' })
  @IsString({ each: true, message: 'each attendeeId must be text.' })
  @ArrayMaxSize(100, { message: 'Cannot invite more than 100 people at once.' })
  attendeeIds!: string[];

  /**
   * Quy tắc lặp dạng RRULE, ví dụ `FREQ=WEEKLY;COUNT=12`.
   *
   * Chỉ để LƯU LẠI và xuất ra .ics — server không tự trải quy tắc này.
   * Regex chặt vì chuỗi sẽ được ghi thẳng vào file .ics của người dùng.
   */
  @IsOptional()
  @Matches(
    /^(RRULE:)?FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Za-z0-9,\-:+]+)*$/,
    {
      message: 'recurrence must be an RRULE such as FREQ=WEEKLY;COUNT=12.',
    },
  )
  @MaxLength(200, { message: 'recurrence is too long.' })
  recurrence?: string | null;

  /**
   * Mốc bắt đầu của TỪNG LẦN diễn ra, khi cuộc họp có lặp.
   *
   * ⚠️ Việc TRẢI quy tắc thành danh sách này do CLIENT làm
   *    (frontend/src/app/utils/lap-lai.util.ts). Cố ý: phép tính lặp có nhiều
   *    bẫy (ngày 31 hằng tháng, 29 tháng 2) và đã có 26 bài test canh ở đó —
   *    viết lại lần thứ hai ở server là chép một cái bẫy sang chỗ mới.
   *
   *    Server không tin danh sách này: nó kiểm số lượng, kiểm từng mốc có phải
   *    ISO hợp lệ không, rồi mới ghi.
   *
   * Rỗng = chỉ diễn ra một lần, dùng `startAt`.
   */
  @IsOptional()
  @IsArray({ message: 'occurrences must be a list.' })
  @IsISO8601(
    {},
    { each: true, message: 'each occurrence must be an ISO 8601 timestamp.' },
  )
  @ArrayMaxSize(200, {
    message: 'A repeating meeting cannot have more than 200 occurrences.',
  })
  occurrences?: string[];

  @IsOptional()
  @IsString({ message: 'googleEventId must be text.' })
  @MaxLength(200, { message: 'googleEventId is too long.' })
  googleEventId?: string | null;

  /**
   * Hai link dưới đây rồi sẽ thành thẻ `<a href>` người dùng bấm vào, nên phải
   * ghim đúng host ngay tại cổng — cùng lý do đã ghim `meetUrl` ở
   * UpdateBoardDto: chặn `javascript:` và mọi thứ trỏ ra ngoài Google.
   */
  @IsOptional()
  @Matches(/^https:\/\/(www\.)?google\.com\/calendar\/[^\s"'<>]*$/, {
    message:
      'googleHtmlLink must be a https://www.google.com/calendar/... link.',
  })
  googleHtmlLink?: string | null;

  @IsOptional()
  @Matches(/^https:\/\/meet\.google\.com\/[A-Za-z0-9-]+$/, {
    message: 'meetUrl must be a https://meet.google.com/... link.',
  })
  meetUrl?: string | null;
}
