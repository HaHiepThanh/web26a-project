import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

/** [BONUS #6] Activity log feed cho board. */
@Injectable()
export class ActivityService {
  constructor(private readonly supabase: SupabaseService) {}

  // TODO: lấy log của board, mới nhất trước.
  async findAll(boardId: string): Promise<unknown[]> {
    return [];
  }

  // TODO: ghi 1 dòng log (câu mô tả) khi có hành động quan trọng.
  async record(boardId: string, userUid: string, actionText: string): Promise<void> {}
}
