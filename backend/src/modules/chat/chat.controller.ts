import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../../common/firebase/firebase-auth.guard';
import { CurrentUser } from '../../common/firebase/current-user.decorator';
import type { CurrentUserInfo } from '../../common/firebase/current-user.decorator';
import { ChatService } from './chat.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';

@UseGuards(FirebaseAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /**
   * MỘT TRANG tin nhắn, mới nhất trước.
   *
   * `before` là con trỏ lấy từ tin CŨ NHẤT của trang trước (`<createdAt>_<id>`).
   * Không truyền = trang đầu.
   */
  @Get()
  findAll(
    @CurrentUser() user: CurrentUserInfo,
    @Query('boardId') boardId: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chat.findAll(user.uid, boardId, before, Number(limit));
  }

  @Post()
  create(@CurrentUser() user: CurrentUserInfo, @Body() body: CreateMessageDto) {
    return this.chat.create(
      body.boardId,
      user.uid,
      body.content,
      body.replyToId,
    );
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id') id: string,
    @Body() body: UpdateMessageDto,
  ) {
    return this.chat.update(user.uid, id, body.content);
  }

  /** Thu hồi — đánh dấu chứ không xoá dòng, xem `chat.service.ts`. */
  @Delete(':id')
  recall(@CurrentUser() user: CurrentUserInfo, @Param('id') id: string) {
    return this.chat.recall(user.uid, id);
  }
}
