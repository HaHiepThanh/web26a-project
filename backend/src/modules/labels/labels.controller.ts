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
import { LabelsService } from './labels.service';

@UseGuards(FirebaseAuthGuard)
@Controller('labels')
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Get()
  findAll(@Query('boardId') boardId: string) {
    return this.labels.findAll(boardId);
  }

  @Post()
  create(@Body() body: { boardId: string; name: string; color: string }) {
    return this.labels.create(body.boardId, body.name, body.color);
  }

  // Gắn nhãn vào card.
  @Post('cards/:cardId/:labelId')
  attach(@Param('cardId') cardId: string, @Param('labelId') labelId: string) {
    return this.labels.attach(cardId, labelId);
  }

  // Gỡ nhãn khỏi card.
  @Delete('cards/:cardId/:labelId')
  detach(@Param('cardId') cardId: string, @Param('labelId') labelId: string) {
    return this.labels.detach(cardId, labelId);
  }
}
