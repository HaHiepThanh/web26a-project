import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../../common/firebase/firebase-auth.guard';
import { AiService } from './ai.service';
import { DetectTaskRequestDto, DetectTaskResponse } from './dto/detect-task.dto';

// Cần đăng nhập mới gọi được AI (tránh lạm dụng quota).
@UseGuards(FirebaseAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  // POST /ai/detect-task — FE gửi tin nhắn, nhận về gợi ý task (nếu có).
  @Post('detect-task')
  detectTask(@Body() body: DetectTaskRequestDto): Promise<DetectTaskResponse> {
    return this.ai.detectTask(body);
  }
}
