/**
 * Link mời vào tổ chức, có thời hạn.
 *
 * Backend đã trả camelCase sẵn nên KHÔNG có mapper cho nhóm này — thêm một lớp
 * đổi tên y hệt chỉ tạo thêm chỗ để lệch trường.
 */

/** Quyền người dùng link sẽ nhận. Không có 'owner': link không trao quyền chủ. */
export type InviteLinkRole = 'admin' | 'member';

/**
 * Một link, nhìn từ màn QUẢN LÝ (owner/admin).
 *
 * ⚠️ Có `token` — đây chính là bí mật. Đừng đưa kiểu này xuống component mà
 *    thành viên thường xem được.
 */
export interface ApiInviteLink {
  id: string;
  orgId: string;
  token: string;
  role: InviteLinkRole;
  /** ISO 8601. Chỉ để HIỂN THỊ. Đừng so với Date.now() để đoán còn sống hay không. */
  expiresAt: string;
  /** null = không giới hạn lượt dùng. */
  maxUses: number | null;
  usedCount: number;
  revokedAt: string | null;
  createdBy: string;
  createdAt: string;
  /**
   * Server tính sẵn: chưa thu hồi + chưa hết hạn + chưa hết lượt.
   *
   * ⚠️ Luôn dùng trường này, đừng tự suy ở client. Đồng hồ máy người dùng lệch
   *    vài phút là đủ để client nói "còn sống" trong khi server trả 410.
   */
  active: boolean;
}

/** Màn hình "Bạn được mời vào ..." — cố ý KHÔNG có `token`. */
export interface ApiInviteLinkPreview {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: InviteLinkRole;
  expiresAt: string;
  /** Đã ở trong tổ chức rồi → cho vào thẳng, đừng hỏi "Tham gia?" nữa. */
  alreadyMember: boolean;
}

/** Kết quả sau khi bấm Tham gia. */
export interface ApiInviteLinkAccepted {
  orgId: string;
  orgSlug: string;
  role: InviteLinkRole;
}

/** Body khi tạo link — cả ba trường đều tuỳ chọn, server có mặc định. */
export interface CreateInviteLinkBody {
  /** 1–30, mặc định 7. */
  expiresInDays?: number;
  /** Mặc định 'member'. */
  role?: InviteLinkRole;
  /** 1–500. Bỏ trống = không giới hạn. */
  maxUses?: number;
}
