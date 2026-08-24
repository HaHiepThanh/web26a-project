import type { OrgInvite } from '../../mocks';
import type { OrgMemberView } from '../../models';

/** Vai trò trong tổ chức — khớp CHECK của cột `organization_members.role`. */
export type OrgRole = 'owner' | 'admin' | 'member';

/**
 * Trạng thái nạp danh sách tổ chức.
 *
 * Vì sao cần trạng thái riêng thay vì mỗi cờ `loading`: guard phải phân biệt được
 * "chưa nạp bao giờ" với "nạp xong và đúng là không có tổ chức nào". Hai cái đó
 * cùng cho `organizations()` rỗng, nhưng một cái phải chờ, một cái được phép đá
 * người dùng sang /onboarding.
 */
export type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface OrganizationState {
  /** Lời mời gửi TỚI tôi, đang chờ trả lời — chuông thông báo đọc cái này. */
  myInvites: OrgInvite[];

  /** Lời mời ĐÃ GỬI của từng tổ chức, khoá theo orgId. Khác hẳn `myInvites`. */
  pendingByOrg: Record<string, OrgInvite[]>;

  /** Thành viên từng tổ chức, khoá theo orgId. Nạp kèm lúc tải danh sách tổ chức. */
  membersByOrg: Record<string, OrgMemberView[]>;

  /** Vai trò của TÔI trong từng tổ chức — dùng ẩn/hiện nút, KHÔNG phải để bảo mật. */
  myRoleByOrg: Record<string, OrgRole>;

  /**
   * Đã nạp xong cho uid nào.
   *
   * ⚠️ Chỉ đặt trường này SAU KHI chắc chắn có ID token. Đặt sớm là dính lại
   *    đúng cái bug ở mục 4 tài liệu: request 401, danh sách rỗng, mà cờ đã bật
   *    nên không lần gọi nào sau đó chịu thử lại.
   */
  loadedForUid: string | null;

  status: LoadStatus;
}

export const initialOrganizationState: OrganizationState = {
  myInvites: [],
  pendingByOrg: {},
  membersByOrg: {},
  myRoleByOrg: {},
  loadedForUid: null,
  status: 'idle',
};
