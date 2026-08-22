// Tổ chức (Organization) — ranh giới cô lập dữ liệu. 1 user thuộc nhiều tổ chức,
// 1 tổ chức có nhiều thành viên. Mỗi tổ chức có Workspace/Board riêng biệt.
export interface Organization {
  id: string;
  name: string;
  /** Đường dẫn riêng, đứng ngay ở gốc URL: /thanh-organization/board/<uuid>.
   *  DUY NHẤT toàn hệ thống và KHÔNG cho đổi sau khi tạo (đổi = chết mọi link đã chia sẻ). */
  slug: string;
  ownerId: string;
  /** Toàn bộ thành viên hiện có (bao gồm cả ownerId). */
  memberIds: string[];
  createdAt: string;
}

export type OrgInviteStatus = 'pending' | 'accepted' | 'declined';

/** Lời mời tham gia tổ chức — người được mời phải bấm đồng ý mới vào. */
export interface OrgInvite {
  id: string;
  orgId: string;
  orgName: string;
  toUserId: string;
  fromUserId: string;
  fromUserName: string;
  /** Quyền sẽ nhận khi bấm Đồng ý — chuông hiện trước để người ta biết mình vào với vai gì. */
  role: import('./api.model').OrgInviteRole;
  status: OrgInviteStatus;
  createdAt: string;
}
