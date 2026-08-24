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
import { CardsService } from './cards.service';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { MoveCardDto } from './dto/move-card.dto';

@UseGuards(FirebaseAuthGuard)
@Controller('cards')
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Get()
  findAll(
    @CurrentUser() user: CurrentUserInfo,
    @Query('boardId') boardId: string,
  ) {
    return this.cards.findAll(user.uid, boardId);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserInfo, @Body() body: CreateCardDto) {
    return this.cards.create(body.listId, body.title, user.uid);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id') id: string,
    @Body() body: UpdateCardDto,
  ) {
    return this.cards.update(user.uid, id, body);
  }

  @Patch(':id/move')
  move(
    @Param('id') id: string,
    @Body() body: MoveCardDto,
    @CurrentUser() user: CurrentUserInfo,
  ) {
    return this.cards.move(id, body.toListId, body.position, user.uid);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserInfo, @Param('id') id: string) {
    return this.cards.remove(user.uid, id);
  }
}
