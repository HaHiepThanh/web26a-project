import type { ApiInviteLink, ApiInviteLinkPreview } from '../../models';

/**
 * Vì sao link mời có store RIÊNG, không nhét vào OrganizationStore:
 *
 * `token` là bí mật và sống ngắn — chỉ cần ở đúng hai màn (quản lý tổ chức và
 * /join). Trộn vào store tổ chức là nó nằm trong bộ nhớ suốt phiên và hiện trong
 * DevTools ở MỌI trang, kể cả những trang không liên quan gì tới lời mời.
 */

/** Kết quả xem trước một link — ba trạng thái loại trừ nhau. */
export type PreviewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; preview: ApiInviteLinkPreview }
  /**
   * `gone` (410) và `invalid` (404) cố ý TÁCH nhau.
   *
   * Người dùng cần phân biệt "link hết hạn, xin người mời gửi link mới" với
   * "link sai" — gộp thành một câu chung chung là họ không biết phải làm gì tiếp.
   */
  | { kind: 'gone'; message: string }
  | { kind: 'invalid'; message: string };

export interface InviteLinkState {
  /** Link của tổ chức đang mở màn quản lý. Rỗng khi chưa nạp hoặc không có quyền. */
  links: ApiInviteLink[];
  /** Đã nạp danh sách cho orgId nào — đổi tổ chức thì phải nạp lại. */
  loadedForOrg: string | null;
  /** Đang thu hồi link nào (id) — để nút Thu hồi tự khoá đúng dòng đó. */
  revoking: ReadonlySet<string>;
  /** Trạng thái màn /join. */
  preview: PreviewState;
  /** Đang gọi accept — khoá nút Tham gia, tránh bấm hai lần tiêu hai lượt. */
  accepting: boolean;
}

export const initialInviteLinkState: InviteLinkState = {
  links: [],
  loadedForOrg: null,
  revoking: new Set(),
  preview: { kind: 'idle' },
  accepting: false,
};
