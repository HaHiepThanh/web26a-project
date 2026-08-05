// Tenant = công ty/team. Mỗi user đăng ký lần đầu sẽ tạo 1 tenant và làm owner (#1).
export interface Tenant {
  id: string; // uuid
  name: string;
  slug: string; // duy nhất
  ownerId: string; // FK auth.users.id
  createdAt: string; // ISO timestamptz
}
