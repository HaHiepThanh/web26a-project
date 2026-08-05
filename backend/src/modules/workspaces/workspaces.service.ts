import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

/** CRUD workspace trong tenant (#3). Nhớ lọc theo tenant của user. */
@Injectable()
export class WorkspacesService {
  constructor(private readonly supabase: SupabaseService) {}

  // TODO: list workspace theo tenantId.
  async findAll(tenantId: string): Promise<unknown[]> {
    return [];
  }

  // TODO: tạo workspace.
  async create(tenantId: string, name: string): Promise<unknown> {
    return null;
  }

  // TODO: đổi tên workspace.
  async update(id: string, name: string): Promise<unknown> {
    return null;
  }

  // TODO: xoá workspace.
  async remove(id: string): Promise<void> {}
}
