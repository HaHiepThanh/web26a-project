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

  /** GET /attachments?cardId= — kèm link tải ký tạm (1 giờ). */
  @Get()
  findAll(
    @CurrentUser() user: CurrentUserInfo,
    @Query('cardId') cardId: string,
  ) {
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
