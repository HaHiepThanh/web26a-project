import { Module } from '@nestjs/common';
import { InviteLinksController } from './invite-links.controller';
import { InviteLinksService } from './invite-links.service';

/**
 * `AccessService` không cần import: `AccessModule` là @Global.
 * `RealtimeGateway` lấy từ `RealtimeModule` (cũng @Global, xem app.module.ts).
 */
@Module({
  controllers: [InviteLinksController],
  providers: [InviteLinksService],
  exports: [InviteLinksService],
})
export class InviteLinksModule {}
