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
import { ListsService } from './lists.service';

@UseGuards(FirebaseAuthGuard)
@Controller('lists')
export class ListsController {
  constructor(private readonly lists: ListsService) {}

  @Get()
  findAll(@CurrentUser() user: CurrentUserInfo, @Query('boardId') boardId: string) {
    return this.lists.findAll(user.uid, boardId);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserInfo, @Body() body: { boardId: string; name: string }) {
    return this.lists.create(user.uid, body.boardId, body.name);
  }

  @Patch(':id')
  rename(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id') id: string,
    @Body() body: { name: string },
  ) {
    return this.lists.rename(user.uid, id, body.name);
  }

  @Patch(':id/position')
  reorder(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id') id: string,
    @Body() body: { position: number },
  ) {
    return this.lists.reorder(user.uid, id, body.position);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserInfo, @Param('id') id: string) {
    return this.lists.remove(user.uid, id);
  }
}
