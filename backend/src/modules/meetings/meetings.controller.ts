import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FirebaseAuthGuard } from '../../common/firebase/firebase-auth.guard';
import { CurrentUser } from '../../common/firebase/current-user.decorator';
import type { CurrentUserInfo } from '../../common/firebase/current-user.decorator';
import { MeetingsService } from './meetings.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { ImportMeetingsDto } from './dto/import-meetings.dto';
import { IcsParserService } from './ics-parser.service';

@UseGuards(FirebaseAuthGuard)
@Controller('meetings')
export class MeetingsController {
  constructor(
    private readonly meetings: MeetingsService,
    private readonly ics: IcsParserService,
  ) {}

  /**
   * POST /meetings/parse-ics — đọc file .ics, TRẢ VỀ danh sách sự kiện.
   *
   * Chỉ ĐỌC, không ghi gì. Người dùng xem danh sách, tick chọn, rồi mới gọi
   * `/meetings/import`. Tách hai bước vì một file lịch có thể chứa cả trăm
   * buổi và gần như không ai muốn nhập hết.
   *
   * ⚠️ Khai TRƯỚC mọi route `:id`, nếu không Nest khớp 'parse-ics' thành id.
   */
  @Post('parse-ics')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  parseIcs(
    @UploadedFile() file: Express.Multer.File,
    @Body('tuNgay') tuNgay?: string,
    @Body('denNgay') denNgay?: string,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('No calendar file uploaded.');
    }
    return this.ics.doc(file.buffer.toString('utf8'), tuNgay, denNgay);
  }

  /** POST /meetings/import — ghi những buổi người dùng đã tick chọn. */
  @Post('import')
  nhapHangLoat(
    @CurrentUser() user: CurrentUserInfo,
    @Body() body: ImportMeetingsDto,
  ) {
    return this.meetings.nhapHangLoat(user.uid, body);
  }

  /**
   * POST /meetings/parse-pdf — trích xuất thông tin lịch họp từ file PDF của Google Calendar.
   */
  @Post('parse-pdf')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async parsePdf(@UploadedFile() file: Express.Multer.File) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Please provide a valid PDF file.');
    }
    return this.meetings.parseGoogleCalendarPdf(file.buffer);
  }



  /**
   * POST /meetings — lưu bản sao cuộc họp VỪA ĐƯỢC TẠO trên Google Calendar.
   *
   * Không tự gọi Google ở đây: token OAuth chỉ có trong trình duyệt người tạo,
   * server này cố ý không giữ token Google nào (xem migrations/0008).
   */
  @Post()
  create(@CurrentUser() user: CurrentUserInfo, @Body() body: CreateMeetingDto) {
    return this.meetings.create(user.uid, body);
  }

}
