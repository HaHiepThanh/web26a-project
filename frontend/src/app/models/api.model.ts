/**
 * HỢP ĐỒNG DỮ LIỆU VỚI BACKEND — hình dạng JSON mà NestJS trả về.
 *
 * Gom về một chỗ để khi backend đổi thì chỉ phải sửa ở đây, và để nhìn một lượt
 * là biết frontend đang trông đợi gì. Trước đây các kiểu này nằm rải rác trong
 * từng service.
 *
 * ⚠️ Toàn bộ API dùng **camelCase**. Thấy `org_id`, `created_at`… nghĩa là có
 *    endpoint nào đó đang trả thẳng dòng Supabase — báo lại người viết backend,
 *    đừng map tạm ở frontend.
 *
 * Đây KHÔNG phải model nghiệp vụ của giao diện. Dữ liệu từ đây được từng service
 * đổi sang model trong `models/` trước khi component dùng — hai lớp tách nhau để
 * backend đổi tên trường không kéo theo sửa hàng loạt component.
 */

import { BoardBackground, BoardVisibility } from './board.model';
import { CardPriority } from './card.model';
import { Role } from './organization-member.model';

/* ------------------------------------------------------------------ *
 * auth — backend/src/modules/auth
 * ------------------------------------------------------------------ */

/** GET /auth/me — camelCase như mọi endpoint khác. */
export interface MeResponse {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    username: string | null;
    phone: string | null;
    jobTitle: string | null;
    avatarUrl: string | null;
    /**
     * Cột jsonb, backend trả nguyên si không kiểm hình dạng. Để `unknown` cho
     * đúng sự thật — chạy qua `parseOnboardingState()` rồi mới được dùng.
     */
    onboardingState: unknown | null;
  };
  organizations: { id: string; name: string; slug: string; role: Role }[];
  /** true khi user chưa thuộc tổ chức nào → điều hướng sang /onboarding. */
  needsOnboarding: boolean;
}

/* ------------------------------------------------------------------ *
 * organizations — backend/src/modules/organizations
 * ------------------------------------------------------------------ */

/** GET /organizations */
export interface ApiMyOrg {
  id: string;
  name: string;
  slug: string;
  role: Role;
}

/** POST /organizations */
export interface ApiCreatedOrg {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: string;
}

/** GET /organizations/:id/members */
export interface ApiOrgMember {
  userId: string;
  role: Role;
  joinedAt: string;
  user: { displayName: string | null; email: string; avatarUrl: string | null };
}

/** GET /organizations/invites/me */
export interface ApiMyInvite {
  id: string;
  orgId: string;
  orgName: string;
  /** Quyền sẽ nhận khi bấm Đồng ý — hiện luôn trong chuông cho người ta biết trước. */
  role: OrgInviteRole;
  fromUser: { displayName: string | null; email: string };
  createdAt: string;
}

/** Quyền chọn được khi mời. Không có 'owner' — mỗi tổ chức chỉ đúng 1 owner. */
export type OrgInviteRole = 'admin' | 'member';

/** GET /users/search?q= — tìm người để mời / thêm vào workspace. */
export interface ApiUserSearchResult {
  id: string;
  email: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  /** true nếu người này đã cùng tổ chức với mình. */
  sharesOrg: boolean;
}

/* ------------------------------------------------------------------ *
 * workspaces — backend/src/modules/workspaces
 * ------------------------------------------------------------------ */

export interface ApiWorkspace {
  id: string;
  orgId: string;
  name: string;
  description: string;
  /** 'org' = cả tổ chức thấy · 'restricted' = chỉ người trong `memberIds`. */
  visibility: WorkspaceVisibility;
  /** Rỗng khi `visibility === 'org'` (lúc đó cả tổ chức đều thấy). */
  memberIds: string[];
  createdBy: string;
  createdAt: string;
}

export type WorkspaceVisibility = 'org' | 'restricted';

/**
 * GET /workspaces/:id/members — VÙNG CHỌN thành viên cho board bên trong.
 *
 * Workspace 'org' trả về toàn bộ thành viên tổ chức; workspace 'restricted' chỉ
 * trả người được chỉ định. Nhờ vậy ô chọn khi tạo board chỉ cần gọi endpoint này,
 * không phải tự đoán nên lấy danh sách nào.
 */
export interface ApiWorkspaceMember {
  userId: string;
  role: 'owner' | 'member';
  joinedAt: string | null;
  user: { id: string; email: string; displayName: string | null; avatarUrl: string | null } | null;
}

/** GET /boards/:id/members */
export interface ApiBoardMember {
  userId: string;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    /**
     * Người này đã nối tài khoản Google chưa (migration 0009).
     *
     * Quyết định họ có mời được vào lịch họp không: chưa nối thì ta KHÔNG chắc
     * email của họ là một tài khoản Google, nên không hứa được rằng lời mời sẽ
     * hiện trong Google Calendar của họ.
     *
     * Tuỳ chọn vì các endpoint cũ hơn không trả trường này.
     */
    googleLinked?: boolean;
  } | null;
}

/* ------------------------------------------------------------------ *
 * boards / lists / labels — backend/src/modules/{boards,lists,labels}
 * ------------------------------------------------------------------ */

export interface ApiBoard {
  id: string;
  orgId: string;
  workspaceId: string;
  name: string;
  visibility: BoardVisibility;
  background: BoardBackground | null;
  backgroundImagePath: string | null;
  /** Link ký tạm để tải ảnh nền (bucket riêng tư). `null` khi board không có ảnh. */
  backgroundImageUrl: string | null;
  meetUrl: string | null;
  meetCreatedBy: string | null;
  createdBy: string;
  createdAt: string;
}

export interface ApiList {
  id: string;
  orgId: string;
  boardId: string;
  name: string;
  position: number;
  createdAt: string;
}

export interface ApiLabel {
  id: string;
  orgId: string;
  boardId: string;
  name: string;
  color: string;
}

/* ------------------------------------------------------------------ *
 * cards / comments / chat — backend/src/modules/{cards,comments,chat}
 * ------------------------------------------------------------------ */

export interface ApiCard {
  id: string;
  orgId: string;
  listId: string;
  title: string;
  description: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  priority: CardPriority;
  completedAt: string | null;
  position: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** GET /comments?cardId= — đã join sang bảng `users` để có tên người bình luận. */
export interface ApiComment {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  user: { displayName: string | null; avatarUrl: string | null } | null;
}

/** POST /comments — trả về dòng vừa tạo, chưa join `users`. */
export interface ApiCreatedComment {
  id: string;
  cardId: string;
  userId: string;
  content: string;
  createdAt: string;
}

/**
 * Hình dạng DUY NHẤT của một tin nhắn từ backend — dùng cho `GET /chat`,
 * `POST /chat`, `PATCH /chat/:id`, `DELETE /chat/:id` VÀ payload WebSocket
 * `chat.message` / `chat.message.updated`.
 *
 * Trước đây có hai kiểu (`ApiMessage` cho danh sách, `ApiCreatedMessage` cho
 * tin vừa tạo) nên phải nuôi HAI hàm ánh xạ song song — thêm một trường là hai
 * chỗ phải nhớ sửa, quên một chỗ thì lỗi chỉ lộ ra ở đúng một luồng.
 */
export interface ApiMessage {
  id: string;
  orgId: string;
  boardId: string;
  userId: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  replyToId: string | null;
  replyTo: {
    id: string;
    userId: string;
    content: string;
    deletedAt: string | null;
    user: { displayName: string | null; avatarUrl: string | null } | null;
  } | null;
  user: { displayName: string | null; avatarUrl: string | null } | null;
}

/** GET /chat — MỘT TRANG, cũ → mới. `hasMore` để biết còn cuộn lên được nữa không. */
export interface ApiMessagePage {
  messages: ApiMessage[];
  hasMore: boolean;
}



/* ------------------------------------------------------------------ *
 * checklist · attachments · stars · saved-filters · highlight-groups · stats
 * backend/docs/API-BO-SUNG.md
 * ------------------------------------------------------------------ */

/** GET /checklist?cardId= */
export interface ApiChecklistItem {
  id: string;
  cardId: string;
  content: string;
  isDone: boolean;
  position: number;
}

/** GET /attachments?cardId= — `url` là link ký, HẾT HẠN SAU 1 GIỜ. */
export interface ApiAttachment {
  id: string;
  cardId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  isImage: boolean;
  isCover: boolean;
  uploadedBy: string;
  createdAt: string;
  url: string | null;
}

/** GET /saved-filters?boardId= */
export interface ApiSavedFilter {
  id: string;
  boardId: string;
  name: string;
  assigneeIds: string[];
  labelIds: string[];
  priorities: string[];
  dateFilter: string | null;
  createdAt: string;
}

/** GET /highlight-groups?boardId= */
export interface ApiHighlightGroup {
  id: string;
  boardId: string;
  name: string;
  cardIds: string[];
  createdAt: string;
}

/** GET /stats/boards/:boardId — gộp cả 3 view vào 1 phản hồi. */
export interface ApiBoardStats {
  overview: {
    boardId: string;
    boardName: string;
    totalCards: number;
    completedCount: number;
    inProgressCount: number;
    overdueCount: number;
    onTimeRatePct: number;
  } | null;
  memberWorkload: {
    userId: string;
    displayName: string | null;
    avatarUrl?: string | null;
    assignedCount: number;
    completedCount: number;
    doingCount: number;
    overdueCount: number;
    lastActiveAt: string | null;
  }[];
  overdueCards: {
    cardId: string;
    title: string;
    assigneeId: string | null;
    assigneeName: string | null;
    dueDate: string | null;
    daysOverdue: number;
  }[];
}

/** GET /organizations/:id/invites — lời mời tổ chức ĐÃ GỬI, chưa ai trả lời. */
export interface ApiPendingInvite {
  id: string;
  orgId: string;
  toUserId: string;
  fromUserId: string;
  role: OrgInviteRole;
  createdAt: string;
  toUser: { displayName: string | null; email: string; avatarUrl: string | null };
}
