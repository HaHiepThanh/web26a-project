import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../../common/firebase/firebase-auth.guard';
import { ActivityService } from './activity.service';

// [BONUS] Log thường được ghi bên trong các service khác; ở đây chỉ expose đọc feed.
@UseGuards(FirebaseAuthGuard)
@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  findAll(@Query('boardId') boardId: string) {
    return this.activity.findAll(boardId);
  }
}
