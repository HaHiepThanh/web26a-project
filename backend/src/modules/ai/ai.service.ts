import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  DetectTaskRequestDto,
  DetectTaskResponse,
} from './dto/detect-task.dto';

/**
 * Gọi Claude để phát hiện tin nhắn giao task và trích ra card gợi ý.
 * ĐÂY là nơi DUY NHẤT gọi Claude API — key nằm ở backend (ANTHROPIC_API_KEY),
 * không bao giờ ở frontend.
 */
@Injectable()
export class AiService {
  private readonly client: Anthropic;
  // Dùng model mới nhất, mạnh và phù hợp cho trích xuất có cấu trúc.
  private readonly model = 'claude-opus-4-8';

  constructor(config: ConfigService) {
    this.client = new Anthropic({
      apiKey: config.getOrThrow<string>('ANTHROPIC_API_KEY'),
    });
  }

  /**
   * Phân tích 1 tin nhắn -> DetectTaskResponse.
   *
   * Gợi ý triển khai (dùng structured outputs để Claude trả JSON đúng schema):
   *   const res = await this.client.messages.create({
   *     model: this.model,
   *     max_tokens: 1024,
   *     output_config: { format: { type: 'json_schema', schema: DETECT_TASK_SCHEMA } },
   *     system: 'Bạn phân loại tin nhắn chat công việc...',
   *     messages: [{ role: 'user', content: buildPrompt(req) }],
   *   });
   *   -> parse text block đầu tiên thành DetectTaskResponse.
   *
   * DETECT_TASK_SCHEMA nên mô tả: isTask(boolean), confidence(number),
   * suggestion({ title, description?, assigneeId?, dueDate? } | null).
   * Truyền danh sách req.members để Claude map assigneeId theo tên.
   */
  async detectTask(req: DetectTaskRequestDto): Promise<DetectTaskResponse> {
    // TODO: gọi Claude như trên rồi trả kết quả thật.
    // Tạm trả mặc định "không phải task" để FE chạy được trước khi hoàn thiện.
    return { isTask: false, confidence: 0, suggestion: null };
  }
}
