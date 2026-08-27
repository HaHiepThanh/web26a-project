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
import { LabelsService } from './labels.service';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';

@UseGuards(FirebaseAuthGuard)
@Controller('labels')
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Get()
  findAll(
    @CurrentUser() user: CurrentUserInfo,
    @Query('boardId') boardId: string,
  ) {
    return this.labels.findAll(user.uid, boardId);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserInfo, @Body() body: CreateLabelDto) {
    return this.labels.create(user.uid, body.boardId, body.name, body.color);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id') labelId: string,
    @Body() body: UpdateLabelDto,
  ) {
    return this.labels.update(user.uid, labelId, body.name, body.color);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id') labelId: string,
  ) {
    return this.labels.delete(user.uid, labelId);
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
