import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';

@Module({
  imports: [ActivityModule],
  controllers: [CardsController],
  providers: [CardsService],
  // task-suggestions tạo thẻ qua CardsService (ăn theo kiểm tra quyền + nhật ký
  // + WebSocket đã có) nên phải export ra ngoài.
  exports: [CardsService],
})
export class CardsModule {}
