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
import { CardsService } from './cards.service';

@UseGuards(FirebaseAuthGuard)
@Controller('cards')
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Get()
  findAll(@Query('boardId') boardId: string) {
    return this.cards.findAll(boardId);
  }

  @Post()
  create(@Body() body: { listId: string; title: string }) {
    return this.cards.create(body.listId, body.title);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.cards.update(id, body);
  }

  @Patch(':id/move')
  move(
    @Param('id') id: string,
    @Body() body: { toListId: string; position: number },
  ) {
    return this.cards.move(id, body.toListId, body.position);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cards.remove(id);
  }
}
