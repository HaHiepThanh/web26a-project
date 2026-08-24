import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './common/supabase/supabase.module';
import { FirebaseModule } from './common/firebase/firebase.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
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
import { AccessModule } from './common/access/access.module';
import { ChecklistModule } from './modules/checklist/checklist.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { BoardPrefsModule } from './modules/board-prefs/board-prefs.module';
import { StatsModule } from './modules/stats/stats.module';
import { AiModule } from './modules/ai/ai.module';
import { TaskSuggestionsModule } from './modules/task-suggestions/task-suggestions.module';
import { InviteLinksModule } from './modules/invite-links/invite-links.module';

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
    // Kiểm tra quyền dùng chung — @Global, xem common/access/access.service.ts.
    AccessModule,
    // Feature modules — lõi
    AuthModule,
    UsersModule,
    OrganizationsModule,
    WorkspacesModule,
    BoardsModule,
    ListsModule,
    CardsModule,
    LabelsModule,
    ChatModule,
    // Gemini — phân tích tin nhắn chat để đề xuất tạo thẻ.
    //
    // Trước đây khối này bị TẮT vì AiService cũ gọi `getOrThrow('ANTHROPIC_API_KEY')`
    // ngay trong constructor: thiếu key là TOÀN BỘ backend không khởi động được.
    // GeminiService nay đọc key kiểu "thiếu thì tắt tính năng", nên bật lại an toàn.
    AiModule,
    TaskSuggestionsModule,
    InviteLinksModule,
    // Bonus
    ActivityModule,
    CommentsModule,
    ChecklistModule,
    AttachmentsModule,
    BoardPrefsModule,
    StatsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
