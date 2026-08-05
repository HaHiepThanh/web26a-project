import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../../common/firebase/firebase-auth.guard';
import { WorkspacesService } from './workspaces.service';

// TODO: tách DTO (CreateWorkspaceDto, UpdateWorkspaceDto) + lấy tenantId từ user.
@UseGuards(FirebaseAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  findAll() {
    // TODO: lấy tenantId của user hiện tại.
    return this.workspaces.findAll('TODO-tenantId');
  }

  @Post()
  create(@Body() body: { name: string }) {
    return this.workspaces.create('TODO-tenantId', body.name);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { name: string }) {
    return this.workspaces.update(id, body.name);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workspaces.remove(id);
  }
}
