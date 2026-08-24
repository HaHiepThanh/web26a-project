import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../../common/firebase/firebase-auth.guard';
import { CurrentUser } from '../../common/firebase/current-user.decorator';
import type { CurrentUserInfo } from '../../common/firebase/current-user.decorator';
import { BoardPrefsService } from './board-prefs.service';
import {
  CreateHighlightGroupDto,
  CreateSavedFilterDto,
} from './dto/board-prefs.dto';

/**
 * Tuỳ chọn riêng của từng người trên board: sao, bộ lọc đã lưu, nhóm highlight.
 * Thành viên thường dùng được hết — đây là dữ liệu của chính họ.
 */
@UseGuards(FirebaseAuthGuard)
@Controller()
export class BoardPrefsController {
  constructor(private readonly prefs: BoardPrefsService) {}

  /** GET /stars — id các board tôi đã gắn sao. */
  @Get('stars')
  myStars(@CurrentUser() user: CurrentUserInfo) {
    return this.prefs.myStarredBoardIds(user.uid);
  }

  /**
   * POST /stars/:boardId
   *
   * Trả 200 chứ không phải 201 (mặc định của Nest cho POST): gắn sao là thao tác
   * LẶP LẠI ĐƯỢC — bấm lần thứ hai không tạo thêm gì cả, nên "đã tạo mới" là sai.
   */
  @Post('stars/:boardId')
  @HttpCode(HttpStatus.OK)
  star(
    @CurrentUser() user: CurrentUserInfo,
    @Param('boardId') boardId: string,
  ) {
    return this.prefs.star(user.uid, boardId);
  }

  /** DELETE /stars/:boardId */
  @Delete('stars/:boardId')
  unstar(
    @CurrentUser() user: CurrentUserInfo,
    @Param('boardId') boardId: string,
  ) {
    return this.prefs.unstar(user.uid, boardId);
  }

  /** GET /saved-filters?boardId= */
  @Get('saved-filters')
  filters(
    @CurrentUser() user: CurrentUserInfo,
    @Query('boardId') boardId: string,
  ) {
    return this.prefs.findFilters(user.uid, boardId);
  }

  @Post('saved-filters')
  createFilter(
    @CurrentUser() user: CurrentUserInfo,
    @Body() body: CreateSavedFilterDto,
  ) {
    return this.prefs.createFilter(user.uid, body);
  }

  @Delete('saved-filters/:id')
  removeFilter(@CurrentUser() user: CurrentUserInfo, @Param('id') id: string) {
    return this.prefs.removeFilter(user.uid, id);
  }

  /** GET /highlight-groups?boardId= */
  @Get('highlight-groups')
  groups(
    @CurrentUser() user: CurrentUserInfo,
    @Query('boardId') boardId: string,
  ) {
    return this.prefs.findGroups(user.uid, boardId);
  }

  @Post('highlight-groups')
  createGroup(
    @CurrentUser() user: CurrentUserInfo,
    @Body() body: CreateHighlightGroupDto,
  ) {
    return this.prefs.createGroup(user.uid, body);
  }

  @Delete('highlight-groups/:id')
  removeGroup(@CurrentUser() user: CurrentUserInfo, @Param('id') id: string) {
    return this.prefs.removeGroup(user.uid, id);
  }
}
