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
import { BoardsService } from './boards.service';

@UseGuards(FirebaseAuthGuard)
@Controller('boards')
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get()
  findAll(@Query('workspaceId') workspaceId: string) {
    return this.boards.findAll(workspaceId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.boards.findOne(id);
  }

  @Post()
  create(@Body() body: { workspaceId: string; name: string }) {
    return this.boards.create(body.workspaceId, body.name);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; visibility?: string },
  ) {
    return this.boards.update(id, body);
  }

  @UseGuards(RolesGuard)
  @Roles('owner')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.boards.remove(id);
  }
}
