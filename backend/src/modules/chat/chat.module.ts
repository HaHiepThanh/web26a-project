import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { TaskSuggestionsModule } from '../task-suggestions/task-suggestions.module';

/**
 * `TaskSuggestionsModule` được import để `ChatService` gọi được `analyze()` sau
 * mỗi tin nhắn.
 *
 * Chiều phụ thuộc chỉ đi MỘT hướng: chat → task-suggestions → cards. Nếu sau này
 * ai đó cho cards hoặc task-suggestions phụ thuộc ngược lại vào chat thì sẽ thành
 * vòng và Nest báo lỗi lúc khởi động.
 */
@Module({
  imports: [TaskSuggestionsModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
