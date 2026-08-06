import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { Tenant, TenantMember, Invite, Role } from '../models';

/**
 * Quản lý tenant, thành viên và invite (#2). Hành động nhạy cảm (đổi role, xoá
 * thành viên, xoá tenant) chỉ owner được phép — kiểm tra thêm ở roleGuard/backend.
 */
@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly api = inject(ApiService); // TODO: gọi backend qua this.api (get/post/patch/delete)

  // --- State ---
  readonly currentTenant = signal<Tenant | null>(null);
  readonly members = signal<TenantMember[]>([]);

  // TODO: tạo tenant mới khi user đăng ký lần đầu, user thành owner (#1).
  async createTenant(name: string): Promise<Tenant | null> {
    return null;
  }

  // TODO: lấy tenant hiện tại của user + set currentTenant.
  async loadCurrentTenant(): Promise<void> {}

  // TODO: lấy danh sách thành viên (join thông tin user: tên, email) -> set members.
  async loadMembers(tenantId: string): Promise<void> {}

  // TODO: tạo invite link (sinh token, đặt expiresAt) — owner (#2).
  async createInvite(tenantId: string): Promise<Invite | null> {
    return null;
  }

  // TODO: dùng token để join tenant; kiểm tra token còn hạn (#2).
  async joinByToken(token: string): Promise<void> {}

  // TODO: đổi role thành viên owner <-> member — owner (#2).
  async changeRole(memberId: string, role: Role): Promise<void> {}

  // TODO: xoá thành viên khỏi tenant — owner (#2).
  async removeMember(memberId: string): Promise<void> {}
}
