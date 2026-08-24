import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../../common/firebase/firebase-auth.guard';
import { CurrentUser } from '../../common/firebase/current-user.decorator';
import type { CurrentUserInfo } from '../../common/firebase/current-user.decorator';
import { TaskSuggestionsService } from './task-suggestions.service';
import { AcceptSuggestionDto } from './dto/accept-suggestion.dto';

/**
 * Gợi ý tạo thẻ do AI phát hiện trong chat.
 *
 * Thành viên thường dùng được hết — đây là "làm việc trên board", không phải
 * "quản lý". Ai trong board cũng chấp nhận hoặc bỏ qua được gợi ý.
 */
@UseGuards(FirebaseAuthGuard)
@Controller('task-suggestions')
export class TaskSuggestionsController {
  constructor(private readonly suggestions: TaskSuggestionsService) {}

  /** GET /task-suggestions?boardId= — các gợi ý còn đang chờ trả lời. */
  @Get()
  findPending(
    @CurrentUser() user: CurrentUserInfo,
    @Query('boardId') boardId: string,
  ) {
    return this.suggestions.findPending(user.uid, boardId);
  }

  /**
   * POST /task-suggestions/:id/accept — tạo thẻ thật từ danh sách ĐÃ SỬA.
   *
   * Trả 200 chứ không phải 201: cái được tạo là các THẺ, không phải tài nguyên
   * nằm ở đường dẫn này. Gợi ý đã xử lý rồi thì trả 409.
   */
  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id') id: string,
    @Body() body: AcceptSuggestionDto,
  ) {
    return this.suggestions.accept(user.uid, id, body.cards);
  }

  /** POST /task-suggestions/:id/dismiss */
  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  dismiss(@CurrentUser() user: CurrentUserInfo, @Param('id') id: string) {
    return this.suggestions.dismiss(user.uid, id);
  }
}
