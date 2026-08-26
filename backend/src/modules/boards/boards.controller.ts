import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FirebaseAuthGuard } from '../../common/firebase/firebase-auth.guard';
import { CurrentUser } from '../../common/firebase/current-user.decorator';
import type { CurrentUserInfo } from '../../common/firebase/current-user.decorator';
import { BoardsService } from './boards.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';

@UseGuards(FirebaseAuthGuard)
@Controller('boards')
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get()
  findAll(
    @CurrentUser() user: CurrentUserInfo,
    @Query('workspaceId') workspaceId: string,
  ) {
    return this.boards.findAll(user.uid, workspaceId);
  }

  /**
   * GET /boards/search?q=...&orgId=...
   * Phải đặt trước :id để chuỗi 'search' không bị nuốt thành ID của board.
   */
  @Get('search')
  search(
    @CurrentUser() user: CurrentUserInfo,
    @Query('q') query: string = '',
    @Query('orgId') orgId?: string,
  ) {
    return this.boards.search(user.uid, query, orgId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentUserInfo, @Param('id') id: string) {
    return this.boards.findOne(user.uid, id);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserInfo, @Body() body: CreateBoardDto) {
    return this.boards.create(
      user.uid,
      body.workspaceId,
      body.name,
      body.visibility ?? 'workspace',
      body.memberIds ?? [],
    );
  }

  /**
   * GET /boards/:id/members — ai được xem board này.
   *
   * Board 'workspace'/'public' trả về thành viên của workspace; board 'private'
   * chỉ trả người được chỉ định. Giao diện dùng đúng endpoint này cho ô chọn
   * "Người phụ trách" nên không bao giờ hiện người không vào được board.
   */
  @Get(':id/members')
  findMembers(@CurrentUser() user: CurrentUserInfo, @Param('id') id: string) {
    return this.boards.findMembers(user.uid, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id') id: string,
    @Body() body: UpdateBoardDto,
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
  /**
   * POST /boards/:id/background — tải ảnh nền cho board.
   *
   * Giới hạn dung lượng khai ở interceptor để Multer chặn NGAY khi nhận, không
   * đọc trọn file vào RAM rồi mới báo quá cỡ.
   */
  @Post(':id/background')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  uploadBackground(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.boards.uploadBackground(user.uid, id, file);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserInfo, @Param('id') id: string) {
    return this.boards.remove(user.uid, id);
  }
}
