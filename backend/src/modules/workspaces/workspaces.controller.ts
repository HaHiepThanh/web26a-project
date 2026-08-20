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
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';

/**
 * Workspace — nhóm board theo phòng ban/dự án, nằm TRONG 1 tổ chức.
 * Bảng: `workspaces`, `workspace_members` (xem database.sql mục 4).
 *
 * TODO(Huy): tách DTO (CreateWorkspaceDto, UpdateWorkspaceDto) thay cho @Body() inline.
 */
@UseGuards(FirebaseAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  /** GET /workspaces?orgId= — danh sách workspace trong 1 tổ chức. */
  @Get()
  findAll(@CurrentUser() user: CurrentUserInfo, @Query('orgId') orgId: string) {
    return this.workspaces.findAll(user.uid, orgId);
  }

  /** POST /workspaces — tạo workspace mới. */
  @Post()
  create(
    @CurrentUser() user: CurrentUserInfo,
    @Body() body: CreateWorkspaceDto,
  ) {
    return this.workspaces.create(user.uid, body.orgId, body.name, body.description);
  }

  /** PATCH /workspaces/:id — đổi tên / mô tả. */
  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id') id: string,
    @Body() body: UpdateWorkspaceDto,
  ) {
    return this.workspaces.update(user.uid, id, body);
  }

  /** DELETE /workspaces/:id — xoá workspace (kéo theo board/list/card bên trong). */
  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserInfo, @Param('id') id: string) {
    return this.workspaces.remove(user.uid, id);
  }
}
