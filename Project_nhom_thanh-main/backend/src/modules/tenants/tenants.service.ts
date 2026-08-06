import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

/** Tenant + thành viên + invite (#1, #2). Hành động nhạy cảm chỉ owner (#7). */
@Injectable()
export class TenantsService {
  constructor(private readonly supabase: SupabaseService) {}

  // TODO: tạo tenant mới, user thành owner (onboarding #1).
  async create(ownerUid: string, name: string): Promise<unknown> {
    return null;
  }

  // TODO: tenant hiện tại của user (null nếu chưa có -> FE điều hướng onboarding).
  async findCurrent(uid: string): Promise<unknown> {
    return null;
  }

  // TODO: danh sách thành viên (join users để có tên/email) (#2).
  async findMembers(tenantId: string): Promise<unknown[]> {
    return [];
  }

  // TODO: đổi role owner<->member (owner) (#2).
  async changeRole(memberId: string, role: 'owner' | 'member'): Promise<void> {}

  // TODO: xoá thành viên (owner) (#2).
  async removeMember(memberId: string): Promise<void> {}

  // TODO: tạo invite link (sinh token + expiresAt) (owner) (#2).
  async createInvite(tenantId: string, createdByUid: string): Promise<unknown> {
    return null;
  }

  // TODO: join tenant bằng token (kiểm tra còn hạn) (#2).
  async joinByToken(uid: string, token: string): Promise<void> {}
}
