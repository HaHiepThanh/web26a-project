import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

/** CRUD list + sắp xếp thứ tự (kéo thả ngang) (#4). */
@Injectable()
export class ListsService {
  constructor(private readonly supabase: SupabaseService) {}

  // TODO: list theo boardId, order by position.
  async findAll(boardId: string): Promise<unknown[]> {
    return [];
  }

  // TODO: tạo list (position cuối).
  async create(boardId: string, name: string): Promise<unknown> {
    return null;
  }

  // TODO: đổi tên list.
  async rename(id: string, name: string): Promise<unknown> {
    return null;
  }

  // TODO: cập nhật position sau kéo thả.
  async reorder(id: string, position: number): Promise<void> {}

  // TODO: xoá list.
  async remove(id: string): Promise<void> {}
}
