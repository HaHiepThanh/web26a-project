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
import { LabelsService } from './labels.service';

@UseGuards(FirebaseAuthGuard)
@Controller('labels')
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Get()
  findAll(@CurrentUser() user: CurrentUserInfo, @Query('boardId') boardId: string) {
    return this.labels.findAll(user.uid, boardId);
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserInfo,
    @Body() body: { boardId: string; name: string; color: string },
  ) {
    return this.labels.create(user.uid, body.boardId, body.name, body.color);
  }

  // Gắn nhãn vào card.
  @Post('cards/:cardId/:labelId')
  attach(
    @CurrentUser() user: CurrentUserInfo,
    @Param('cardId') cardId: string,
    @Param('labelId') labelId: string,
  ) {
    return this.labels.attach(user.uid, cardId, labelId);
  }

  // Gỡ nhãn khỏi card.
  @Delete('cards/:cardId/:labelId')
  detach(
    @CurrentUser() user: CurrentUserInfo,
    @Param('cardId') cardId: string,
    @Param('labelId') labelId: string,
  ) {
    return this.labels.detach(user.uid, cardId, labelId);
  }
}
