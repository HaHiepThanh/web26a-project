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

@UseGuards(FirebaseAuthGuard)
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

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
