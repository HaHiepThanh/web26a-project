import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

/** CRUD card + kéo thả giữa/trong list (#4). */
@Injectable()
export class CardsService {
  constructor(private readonly supabase: SupabaseService) {}

  // TODO: lấy toàn bộ card của board (FE group theo listId).
  async findAll(boardId: string): Promise<unknown[]> {
    return [];
  }

  // TODO: tạo card trong list.
  async create(listId: string, title: string): Promise<unknown> {
    return null;
  }

  // TODO: cập nhật chi tiết (title, description, assigneeId, dueDate...).
  async update(id: string, changes: Record<string, unknown>): Promise<unknown> {
    return null;
  }

  // TODO: chuyển list và/hoặc đổi position (kéo thả).
  async move(id: string, toListId: string, position: number): Promise<void> {}

  // TODO: xoá card (bonus: soft delete).
  async remove(id: string): Promise<void> {}
}
