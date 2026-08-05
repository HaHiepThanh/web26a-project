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
import { ListsService } from './lists.service';

@UseGuards(FirebaseAuthGuard)
@Controller('lists')
export class ListsController {
  constructor(private readonly lists: ListsService) {}

  @Get()
  findAll(@Query('boardId') boardId: string) {
    return this.lists.findAll(boardId);
  }

  @Post()
  create(@Body() body: { boardId: string; name: string }) {
    return this.lists.create(body.boardId, body.name);
  }

  @Patch(':id')
  rename(@Param('id') id: string, @Body() body: { name: string }) {
    return this.lists.rename(id, body.name);
  }

  @Patch(':id/position')
  reorder(@Param('id') id: string, @Body() body: { position: number }) {
    return this.lists.reorder(id, body.position);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.lists.remove(id);
  }
}
