import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../../common/firebase/firebase-auth.guard';
import { CurrentUser } from '../../common/firebase/current-user.decorator';
import type { CurrentUserInfo } from '../../common/firebase/current-user.decorator';
import { ChecklistService } from './checklist.service';
import { CreateChecklistItemDto, UpdateChecklistItemDto } from './dto/create-checklist-item.dto';

/** Checklist trong thẻ. Thành viên thường VẪN dùng được — đây là "làm việc", không phải "quản lý". */
@UseGuards(FirebaseAuthGuard)
@Controller('checklist')
export class ChecklistController {
  constructor(private readonly checklist: ChecklistService) {}

  /** GET /checklist?cardId= */
  @Get()
  findAll(@CurrentUser() user: CurrentUserInfo, @Query('cardId') cardId: string) {
    return this.checklist.findAll(user.uid, cardId);
  }

  /** POST /checklist */
  @Post()
  create(@CurrentUser() user: CurrentUserInfo, @Body() body: CreateChecklistItemDto) {
    return this.checklist.create(user.uid, body.cardId, body.content);
  }

  /** PATCH /checklist/:id — đổi nội dung, tick/bỏ tick, đổi vị trí. */
  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id') id: string,
    @Body() body: UpdateChecklistItemDto,
  ) {
    return this.checklist.update(user.uid, id, body);
  }

  /** DELETE /checklist/:id */
  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserInfo, @Param('id') id: string) {
    return this.checklist.remove(user.uid, id);
  }
}
