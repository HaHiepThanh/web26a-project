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
  fromUser: { displayName: string | null; email: string };
  createdAt: string;
}

/* ------------------------------------------------------------------ *
 * workspaces — backend/src/modules/workspaces
 * ------------------------------------------------------------------ */

export interface ApiWorkspace {
  id: string;
  orgId: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
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

/** GET /chat?boardId= — đã join sang bảng `users`. */
export interface ApiMessage {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  user: { displayName: string | null; avatarUrl: string | null } | null;
}

/** POST /chat — dòng vừa tạo, chưa join `users`. Cũng chính là hình dạng của sự
 *  kiện WebSocket `chat.message` mà server phát cho mọi người đang mở board. */
export interface ApiCreatedMessage {
  id: string;
  orgId: string;
  boardId: string;
  userId: string;
  content: string;
  createdAt: string;
}
