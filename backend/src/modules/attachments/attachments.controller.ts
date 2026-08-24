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
import { AttachmentsService } from './attachments.service';

/** 10MB — chặn ngay ở tầng nhận file, khỏi tốn công đọc hết vào RAM rồi mới từ chối. */
const MAX_BYTES = 10 * 1024 * 1024;

@UseGuards(FirebaseAuthGuard)
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  /**
   * GET /attachments?cardId= — đính kèm của 1 thẻ.
   * GET /attachments?boardId= — đính kèm của TOÀN BỘ thẻ trong board (nạp một
   * lần khi mở board, để bìa/số đếm đính kèm hiện đúng trên mặt thẻ ngay cả
   * với những thẻ chưa từng được mở modal — xem ghi chú ở `findAllByBoard`).
   * Kèm link tải ký tạm (1 giờ) ở cả hai trường hợp.
   */
  @Get()
  findAll(
    @CurrentUser() user: CurrentUserInfo,
    @Query('cardId') cardId: string,
    @Query('boardId') boardId: string,
  ) {
    if (boardId) return this.attachments.findAllByBoard(user.uid, boardId);
    return this.attachments.findAll(user.uid, cardId);
  }

  /**
   * POST /attachments — multipart/form-data với field `file` + `cardId`.
   *
   * Dùng bộ nhớ tạm (memoryStorage mặc định của multer) chứ không ghi ra đĩa
   * máy chủ: file chỉ đi ngang qua backend rồi lên Storage, giữ lại trên đĩa
   * chỉ tổ đầy ổ và phải dọn.
   */
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  upload(
    @CurrentUser() user: CurrentUserInfo,
    @Body('cardId') cardId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.attachments.upload(user.uid, cardId, file);
  }

  /** PATCH /attachments/:id/cover — body `{ isCover: true|false }`. */
  @Patch(':id/cover')
  setCover(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id') id: string,
    @Body('isCover') isCover: boolean,
  ) {
    return this.attachments.setCover(user.uid, id, isCover !== false);
  }

  /** DELETE /attachments/:id — xoá cả dòng lẫn file trong Storage. */
  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserInfo, @Param('id') id: string) {
    return this.attachments.remove(user.uid, id);
  }
}
