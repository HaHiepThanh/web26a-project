import { Global, Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

/**
 * `@Global()` để mọi feature module (cards, lists, chat...) inject được
 * `RealtimeGateway` mà không phải thêm import vào từng module một.
 *
 * Chiều phụ thuộc chỉ đi MỘT hướng: cards/lists/chat → gateway. Gateway không
 * biết gì về chúng (nó chỉ cần Firebase + Supabase, đều là module global), nên
 * không có phụ thuộc vòng.
 */
@Global()
@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
