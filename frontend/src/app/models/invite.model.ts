// Link mời tham gia tenant, có token và thời hạn (#2).
export interface Invite {
  id: string; // uuid
  tenantId: string; // FK tenants.id
  token: string; // duy nhất, dùng trong URL /join/:token
  createdBy: string; // FK auth.users.id
  expiresAt: string; // ISO timestamptz
}
