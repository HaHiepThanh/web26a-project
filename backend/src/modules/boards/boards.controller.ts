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

  /**
   * Xoá board — chỉ owner/admin của tổ chức.
   *
   * ⚠️ KHÔNG dùng `@Roles('owner')` + RolesGuard ở đây được. Guard tìm orgId ở
   *    `req.params.id`; với route `/organizations/:id/...` thì đúng, nhưng ở đây
   *    `params.id` là ID CỦA BOARD. Guard mang id board đi tra
   *    `organization_members` → không có dòng nào → 403 cho TẤT CẢ, kể cả chủ
   *    tổ chức đang xoá board của chính mình.
   *
   *    Muốn biết board thuộc tổ chức nào thì bắt buộc phải đọc database — việc
   *    đó thuộc về service, nên kiểm tra vai trò nằm trong `boards.remove()`.
   */
  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserInfo, @Param('id') id: string) {
    return this.boards.remove(user.uid, id);
  }
}
