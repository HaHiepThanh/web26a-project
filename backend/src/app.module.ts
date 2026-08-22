import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './common/supabase/supabase.module';
import { FirebaseModule } from './common/firebase/firebase.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { BoardsModule } from './modules/boards/boards.module';
import { ListsModule } from './modules/lists/lists.module';
import { CardsModule } from './modules/cards/cards.module';
import { LabelsModule } from './modules/labels/labels.module';
import { ChatModule } from './modules/chat/chat.module';
// import { AiModule } from './modules/ai/ai.module';   // ⏸ tạm tắt — xem ghi chú bên dưới
import { ActivityModule } from './modules/activity/activity.module';
import { CommentsModule } from './modules/comments/comments.module';
import { RealtimeModule } from './modules/realtime/realtime.module';

@Module({
  imports: [
    // envFilePath: .env đặt ở GỐC dự án (ngang hàng backend/), cạnh secrets/.
    // Đường dẫn tính từ thư mục chạy lệnh npm, tức backend/. Vẫn giữ './.env'
    // làm phương án dự phòng cho ai đặt file trong backend/ như .env.example nói.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../.env', '.env'] }),
    // Hạ tầng dùng chung (global)
    SupabaseModule,
    FirebaseModule,
    // WebSocket theo board — @Global, mọi module dưới đây phát sự kiện qua nó.
    RealtimeModule,
    // Feature modules — lõi
    AuthModule,
    OrganizationsModule,
    WorkspacesModule,
    BoardsModule,
    ListsModule,
    CardsModule,
    LabelsModule,
    ChatModule,
    // ⏸ AiModule TẠM TẮT — tính năng "AI gợi ý tạo thẻ từ tin nhắn" để làm sau.
    //
    //    Lý do phải tắt hẳn chứ không chỉ bỏ khỏi bài tập: AiService gọi
    //    config.getOrThrow('ANTHROPIC_API_KEY') ngay trong constructor, mà
    //    NestJS khởi tạo mọi provider lúc bật app — nên thiếu key là TOÀN BỘ
    //    backend không chạy được, chứ không riêng gì AI.
    //
    //    Bật lại: bỏ comment dòng import ở trên + dòng `AiModule,` dưới đây,
    //    và thêm ANTHROPIC_API_KEY vào backend/.env.
    // AiModule,
    // Bonus
    ActivityModule,
    CommentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
