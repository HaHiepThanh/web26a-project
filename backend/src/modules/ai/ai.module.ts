import { Global, Module } from '@nestjs/common';
import { GeminiService } from './gemini.service';

/**
 * @Global: `TaskSuggestionsService` cần gọi Gemini, và module này không phụ thuộc
 * ngược lại cái gì cả nên không có nguy cơ phụ thuộc vòng.
 *
 * ⚠️ Module này KHÔNG còn controller. Bản trước có `POST /ai/detect-task` để
 *    frontend tự gọi rồi tự quyết định — nhưng như vậy chỉ NGƯỜI GỬI mới thấy gợi
 *    ý, và mỗi client lại tự phân tích lại cùng một tin nhắn. Nay việc phân tích
 *    nằm trong luồng `POST /chat` ở server, kết quả lưu database rồi phát cho cả
 *    board.
 */
@Global()
@Module({
  providers: [GeminiService],
  exports: [GeminiService],
})
export class AiModule {}
