import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../../common/firebase/firebase-auth.guard';
import { CurrentUser } from '../../common/firebase/current-user.decorator';
import type { CurrentUserInfo } from '../../common/firebase/current-user.decorator';
import { StatsService } from './stats.service';

@UseGuards(FirebaseAuthGuard)
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  /**
   * GET /stats/boards/:boardId — số liệu tổng quan + khối lượng theo người +
   * danh sách thẻ quá hạn, cho modal "Thống kê & Báo cáo".
   */
  @Get('boards/:boardId')
  boardStats(@CurrentUser() user: CurrentUserInfo, @Param('boardId') boardId: string) {
    return this.stats.boardStats(user.uid, boardId);
  }
}
