// Link mời tham gia tổ chức, có token và thời hạn (#2).
export interface Invite {
  id: string; // uuid
  orgId: string; // FK organizations.id
  token: string; // duy nhất, dùng trong URL /join/:token
  createdBy: string; // FK auth.users.id
  expiresAt: string; // ISO timestamptz
}
