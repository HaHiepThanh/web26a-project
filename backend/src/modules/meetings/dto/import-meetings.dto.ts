import {
  ArrayMaxSize, IsArray, IsISO8601, IsOptional, IsString, Matches, MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Một buổi người dùng đã TICK CHỌN trong danh sách sau khi đọc file. */
export class SuKienNhapDto {
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

  @IsOptional()
  @Matches(/^https:\/\/meet\.google\.com\/[A-Za-z0-9-]+$/, {
    message: 'meetUrl must be a https://meet.google.com/... link.',
  })
  meetUrl?: string | null;
}

/**
 * Nhập HÀNG LOẠT từ file lịch.
 *
 * ⚠️ CỐ Ý không tạo lại sự kiện bên Google. File .ics vốn được xuất ra TỪ một
 *    lịch — đẩy ngược lên là nhân đôi trong lịch người dùng, và `sendUpdates`
 *    sẽ bắn lại thư mời cho những người đã nhận từ lâu.
 */
export class ImportMeetingsDto {
  @IsString({ message: 'boardId must be text.' })
  boardId!: string;

  @Matches(/^[A-Za-z][A-Za-z0-9+_-]*(\/[A-Za-z0-9+_-]+)*$/, {
    message: 'timeZone must be an IANA time zone such as Asia/Ho_Chi_Minh.',
  })
  @MaxLength(64, { message: 'timeZone is too long.' })
  timeZone!: string;

  /**
   * Trần 200 khớp với trần của bộ đọc. Không chặn thì một file lịch cả năm
   * đẻ ra hàng nghìn dòng và hàng nghìn lời nhắc.
   */
  @IsArray({ message: 'events must be a list.' })
  @ArrayMaxSize(200, { message: 'Cannot import more than 200 events at once.' })
  @ValidateNested({ each: true })
  @Type(() => SuKienNhapDto)
  events!: SuKienNhapDto[];

  /** Firebase uid của người được gắn vào MỌI buổi nhập. Service lọc lại. */
  @IsOptional()
  @IsArray({ message: 'attendeeIds must be a list.' })
  @IsString({ each: true, message: 'each attendeeId must be text.' })
  @ArrayMaxSize(100, { message: 'Cannot invite more than 100 people.' })
  attendeeIds?: string[];
}
