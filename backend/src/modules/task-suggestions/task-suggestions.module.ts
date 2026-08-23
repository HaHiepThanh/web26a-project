import { Module } from '@nestjs/common';
import { TaskSuggestionsController } from './task-suggestions.controller';
import { TaskSuggestionsService } from './task-suggestions.service';
import { CardsModule } from '../cards/cards.module';

/**
 * `CardsModule` được import để tạo thẻ qua `CardsService` thay vì tự INSERT —
 * nhờ vậy ăn theo luôn phần kiểm tra quyền, ghi nhật ký và phát WebSocket đã có.
 *
 * Chiều phụ thuộc: task-suggestions → cards. `ChatModule` thì phụ thuộc ngược lại
 * vào task-suggestions, nên KHÔNG được để cards phụ thuộc chat (hiện không có).
 */
@Module({
  imports: [CardsModule],
  controllers: [TaskSuggestionsController],
  providers: [TaskSuggestionsService],
  exports: [TaskSuggestionsService],
})
export class TaskSuggestionsModule {}
