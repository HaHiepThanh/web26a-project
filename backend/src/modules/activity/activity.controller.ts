import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../../common/firebase/firebase-auth.guard';
import { CurrentUser } from '../../common/firebase/current-user.decorator';
import type { CurrentUserInfo } from '../../common/firebase/current-user.decorator';
import { ActivityService } from './activity.service';

// [BONUS] Log thường được ghi bên trong các service khác; ở đây chỉ expose đọc feed.
@UseGuards(FirebaseAuthGuard)
@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  findAll(@CurrentUser() user: CurrentUserInfo, @Query('boardId') boardId: string) {
    return this.activity.findAll(user.uid, boardId);
  }
}
