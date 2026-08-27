import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './common/supabase/supabase.module';
import { FirebaseModule } from './common/firebase/firebase.module';
import { MailModule } from './common/mail/mail.module';
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
import { ModerationModule } from './common/moderation/moderation.module';
import { ChecklistModule } from './modules/checklist/checklist.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { BoardPrefsModule } from './modules/board-prefs/board-prefs.module';
import { StatsModule } from './modules/stats/stats.module';
import { AiModule } from './modules/ai/ai.module';
import { TaskSuggestionsModule } from './modules/task-suggestions/task-suggestions.module';
import { InviteLinksModule } from './modules/invite-links/invite-links.module';
import { MeetingsModule } from './modules/meetings/meetings.module';

@Module({
  imports: [
    // MỌI biến môi trường nằm ở MỘT file duy nhất: `secrets/.env`.
    //
    // Trước đây chúng rải ở hai nơi — `backend/.env` (nơi code thật sự đọc) và
    // `secrets/.env` (nơi không ai đọc). Hệ quả: đặt khoá vào `secrets/.env`
    // rồi tưởng đã cấu hình xong, mà backend không hề thấy.
    //
    // Đường dẫn tính từ thư mục chạy lệnh npm, tức `backend/`. Hai mục sau chỉ
    // là dự phòng cho máy chưa gộp; NestJS lấy giá trị ở FILE ĐẦU TIÊN tìm thấy.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../secrets/.env', '../.env', '.env'],
    }),
    // Hạ tầng dùng chung (global)
    SupabaseModule,
    FirebaseModule,
    MailModule,
    // WebSocket theo board — @Global, mọi module dưới đây phát sự kiện qua nó.
    RealtimeModule,
    // Kiểm tra quyền dùng chung — @Global, xem common/access/access.service.ts.
    AccessModule,
    // Kiểm duyệt ảnh 18+ — @Global, mọi đường upload ảnh đi qua nó.
    ModerationModule,
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
    // Lịch họp Google Calendar — bản sao phía mình để chuông nhắc trước giờ.
    MeetingsModule,
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
