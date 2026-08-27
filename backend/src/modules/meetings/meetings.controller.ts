import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
   * GET /meetings/my-upcoming — nguồn cho lời nhắc ở chuông 🔔.
   *
   * ⚠️ PHẢI khai TRƯỚC mọi route có `:id`, nếu không Nest khớp 'my-upcoming'
   *    thành một id và route này không bao giờ chạy tới. Cùng cái bẫy đã ghi
   *    chú ở `GET /cards/my-due`.
   */
  @Get('my-upcoming')
  myUpcoming(@CurrentUser() user: CurrentUserInfo) {
    return this.meetings.myUpcoming(user.uid);
  }

  /** GET /meetings?boardId=... — lịch sắp tới của một board. */
  @Get()
  findForBoard(
    @CurrentUser() user: CurrentUserInfo,
    @Query('boardId') boardId: string,
  ) {
    return this.meetings.findForBoard(user.uid, boardId);
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

  /** DELETE /meetings/:id — huỷ mềm; xem ghi chú `cancel()` về giới hạn với Google. */
  @Delete(':id')
  cancel(@CurrentUser() user: CurrentUserInfo, @Param('id') id: string) {
    return this.meetings.cancel(user.uid, id);
  }
}
