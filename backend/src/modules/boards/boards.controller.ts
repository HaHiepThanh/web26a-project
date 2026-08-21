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
import { RolesGuard } from '../../common/firebase/roles.guard';
import { Roles } from '../../common/firebase/roles.decorator';
import { CurrentUser } from '../../common/firebase/current-user.decorator';
import type { CurrentUserInfo } from '../../common/firebase/current-user.decorator';
import { BoardsService } from './boards.service';

@UseGuards(FirebaseAuthGuard)
@Controller('boards')
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get()
  findAll(@CurrentUser() user: CurrentUserInfo, @Query('workspaceId') workspaceId: string) {
    return this.boards.findAll(user.uid, workspaceId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentUserInfo, @Param('id') id: string) {
    return this.boards.findOne(user.uid, id);
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserInfo,
    @Body() body: { workspaceId: string; name: string },
  ) {
    return this.boards.create(user.uid, body.workspaceId, body.name);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id') id: string,
    @Body() body: { name?: string; visibility?: string },
  ) {
    return this.boards.update(user.uid, id, body);
  }

  @UseGuards(RolesGuard)
  @Roles('owner')
  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserInfo, @Param('id') id: string) {
    return this.boards.remove(user.uid, id);
  }
}
