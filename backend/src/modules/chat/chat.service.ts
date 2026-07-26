import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

/** [AI-CHAT] Tin nhắn chat theo board (cần bảng messages). */
@Injectable()
export class ChatService {
  constructor(private readonly supabase: SupabaseService) {}

  // TODO: lấy lịch sử tin nhắn của board (join users), cũ -> mới.
  async findAll(boardId: string): Promise<unknown[]> {
    return [];
  }

  // TODO: lưu tin nhắn mới. (AI detect-task chạy riêng qua AiModule.)
  async create(boardId: string, userUid: string, content: string): Promise<unknown> {
    return null;
  }
}
