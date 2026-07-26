import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

/** [BONUS #4] Bình luận trong card. */
@Injectable()
export class CommentsService {
  constructor(private readonly supabase: SupabaseService) {}

  // TODO: lấy bình luận của card (join users).
  async findAll(cardId: string): Promise<unknown[]> {
    return [];
  }

  // TODO: thêm bình luận.
  async create(cardId: string, userUid: string, content: string): Promise<unknown> {
    return null;
  }

  // TODO: xoá bình luận (chỉ tác giả).
  async remove(id: string, userUid: string): Promise<void> {}
}
