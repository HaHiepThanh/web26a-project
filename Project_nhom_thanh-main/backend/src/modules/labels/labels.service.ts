import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

/** Nhãn màu theo board + gắn/gỡ nhãn cho card (#4). */
@Injectable()
export class LabelsService {
  constructor(private readonly supabase: SupabaseService) {}

  // TODO: lấy nhãn của board.
  async findAll(boardId: string): Promise<unknown[]> {
    return [];
  }

  // TODO: tạo nhãn (name + color hex).
  async create(boardId: string, name: string, color: string): Promise<unknown> {
    return null;
  }

  // TODO: gắn nhãn vào card (insert card_labels).
  async attach(cardId: string, labelId: string): Promise<void> {}

  // TODO: gỡ nhãn khỏi card.
  async detach(cardId: string, labelId: string): Promise<void> {}
}
