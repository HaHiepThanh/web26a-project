import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../../common/firebase/firebase-auth.guard';
import { CurrentUser } from '../../common/firebase/current-user.decorator';
import type { CurrentUserInfo } from '../../common/firebase/current-user.decorator';
import { ChatService } from './chat.service';
import { CreateMessageDto } from './dto/create-message.dto';

@UseGuards(FirebaseAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  findAll(@Query('boardId') boardId: string) {
    return this.chat.findAll(boardId);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserInfo, @Body() body: CreateMessageDto) {
    return this.chat.create(body.boardId, user.uid, body.content);
  }
}
