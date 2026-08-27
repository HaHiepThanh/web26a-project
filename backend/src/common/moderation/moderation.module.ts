import { Global, Module } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { VisionProvider } from './vision.provider';
import { GeminiVisionProvider } from './gemini-vision.provider';

/**
 * @Global vì BA module cần dùng: `auth` (avatar), `boards` (ảnh nền) và
 * `attachments` (ảnh đính kèm thẻ). Không phụ thuộc ngược lại module nào nên
 * không có nguy cơ phụ thuộc vòng.
 */
@Global()
@Module({
  providers: [ModerationService, VisionProvider, GeminiVisionProvider],
  exports: [ModerationService],
})
export class ModerationModule {}
