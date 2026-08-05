import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

/** CRUD board + visibility (#3). Xoá board chỉ owner (#7). */
@Injectable()
export class BoardsService {
  constructor(private readonly supabase: SupabaseService) {}

  // TODO: list board theo workspaceId (kèm số card/member).
  async findAll(workspaceId: string): Promise<unknown[]> {
    return [];
  }

  // TODO: lấy 1 board theo id.
  async findOne(id: string): Promise<unknown> {
    return null;
  }

  // TODO: tạo board.
  async create(workspaceId: string, name: string): Promise<unknown> {
    return null;
  }

  // TODO: sửa tên/visibility.
  async update(id: string, changes: { name?: string; visibility?: string }): Promise<unknown> {
    return null;
  }

  // TODO: xoá board.
  async remove(id: string): Promise<void> {}
}
