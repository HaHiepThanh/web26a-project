/**
 * Types & mock data for "Manage Workspace Members" (Settings > Manage Workspace).
 *
 * Kept colocated in this feature folder (not in the shared `models/` barrel)
 * on purpose: this feature is frontend-only / mock-backed until the Board
 * (list & card) page exists. Whoever wires the real API later can replace
 * the mock*() functions below with real HTTP calls without touching any
 * shared file outside this folder.
 */

export type BoardRole = 'admin' | 'member' | 'observer';

/** The signed-in user, for now hardcoded — swap for AuthService.currentUser() once
 *  board membership is resolved against a real backend. */
export const CURRENT_USER_ID = 'me';

export interface ProjectSummary {
  id: string;
  name: string;
  workspaceName: string;
  myRole: BoardRole;
  memberCount: number;
  memberAvatars: string[];
}

export interface AssignedCardMock {
  id: string;
  title: string;
  listName: string;
  dueDate: string | null;
}

export interface BoardMember {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string;
  role: BoardRole;
  assignedCards: AssignedCardMock[];
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: BoardRole;
  invitedBy: string;
  invitedAt: string;
}

export interface JoinRequest {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string;
  requestedAt: string;
}

export interface ProjectDetail {
  id: string;
  name: string;
  workspaceName: string;
  members: BoardMember[];
  pendingInvitations: PendingInvitation[];
  joinRequests: JoinRequest[];
}

const ROLE_LABELS: Record<BoardRole, string> = {
  admin: 'Admin',
  member: 'Member',
  observer: 'Observer',
};

export function roleLabel(role: BoardRole): string {
  return ROLE_LABELS[role];
}

function avatar(seed: string): string {
  return `https://i.pravatar.cc/100?u=${encodeURIComponent(seed)}`;
}

/** In-memory mock "database" — 3 projects covering all 3 roles for the current user. */
const PROJECTS: Record<string, ProjectDetail> = {
  // -- Dữ liệu mẫu đã comment để test từ tài khoản trắng hoàn toàn — bỏ comment để khôi phục --
  // 'b-1': {
  //   id: 'b-1',
  //   name: 'Hệ thống Quản lý Kanban',
  //   workspaceName: 'Đồ án Tốt nghiệp CNTT',
  //   members: [
  //     { userId: CURRENT_USER_ID, name: 'Bạn', email: 'me@example.com', avatarUrl: avatar('me'), role: 'admin', assignedCards: [
  //       { id: 'c1', title: 'Thiết kế schema database', listName: 'Doing', dueDate: '2026-08-10' },
  //     ] },
  //     { userId: 'u2', name: 'Nguyễn Minh Anh', email: 'minhanh@company.com', avatarUrl: avatar('u2'), role: 'admin', assignedCards: [
  //       { id: 'c2', title: 'Review pull request #482', listName: 'Doing', dueDate: '2026-08-06' },
  //       { id: 'c3', title: 'Viết API xác thực người dùng', listName: 'To Do', dueDate: null },
  //     ] },
  //     { userId: 'u3', name: 'Trần Bảo Long', email: 'long.tran@company.com', avatarUrl: avatar('u3'), role: 'member', assignedCards: [
  //       { id: 'c4', title: 'Thiết kế wireframe trang chủ', listName: 'To Do', dueDate: '2026-08-12' },
  //     ] },
  //     { userId: 'u4', name: 'Lê Thu Hà', email: 'ha.le@company.com', avatarUrl: avatar('u4'), role: 'member', assignedCards: [] },
  //     { userId: 'u5', name: 'Phạm Quốc Việt', email: 'viet.pham@partner.com', avatarUrl: avatar('u5'), role: 'observer', assignedCards: [] },
  //   ],
  //   pendingInvitations: [
  //     { id: 'inv1', email: 'newdev@company.com', role: 'member', invitedBy: 'Bạn', invitedAt: '2026-08-01' },
  //   ],
  //   joinRequests: [
  //     { id: 'jr1', userId: 'u9', name: 'Đỗ Xuân Bách', email: 'bach.do@company.com', avatarUrl: avatar('u9'), requestedAt: '2026-08-02' },
  //   ],
  // },
  // 'b-2': {
  //   id: 'b-2',
  //   name: 'Ứng dụng tìm trọ thông minh',
  //   workspaceName: 'Đồ án Tốt nghiệp CNTT',
  //   members: [
  //     { userId: CURRENT_USER_ID, name: 'Bạn', email: 'me@example.com', avatarUrl: avatar('me'), role: 'member', assignedCards: [
  //       { id: 'c5', title: 'Tích hợp bản đồ Google Maps', listName: 'Doing', dueDate: '2026-08-09' },
  //     ] },
  //     { userId: 'u6', name: 'Hoàng Nam', email: 'nam.hoang@company.com', avatarUrl: avatar('u6'), role: 'admin', assignedCards: [] },
  //     { userId: 'u7', name: 'Vũ Thị Kim', email: 'kim.vu@company.com', avatarUrl: avatar('u7'), role: 'observer', assignedCards: [] },
  //   ],
  //   pendingInvitations: [],
  //   joinRequests: [],
  // },
  // 'b-3': {
  //   id: 'b-3',
  //   name: 'Kế hoạch Tuần cá nhân',
  //   workspaceName: 'Đồ án Tốt nghiệp CNTT',
  //   members: [
  //     { userId: CURRENT_USER_ID, name: 'Bạn', email: 'me@example.com', avatarUrl: avatar('me'), role: 'observer', assignedCards: [] },
  //     { userId: 'u2', name: 'Nguyễn Minh Anh', email: 'minhanh@company.com', avatarUrl: avatar('u2'), role: 'admin', assignedCards: [
  //       { id: 'c6', title: 'Lên kế hoạch tuần', listName: 'To Do', dueDate: '2026-08-05' },
  //     ] },
  //   ],
  //   pendingInvitations: [],
  //   joinRequests: [],
  // },
};

export function mockProjects(): ProjectSummary[] {
  return Object.values(PROJECTS).map((p) => {
    const me = p.members.find((m) => m.userId === CURRENT_USER_ID)!;
    return {
      id: p.id,
      name: p.name,
      workspaceName: p.workspaceName,
      myRole: me.role,
      memberCount: p.members.length,
      memberAvatars: p.members.slice(0, 4).map((m) => m.avatarUrl),
    };
  });
}

export function mockProjectDetail(boardId: string): ProjectDetail | null {
  const found = PROJECTS[boardId];
  return found ? structuredClone(found) : null;
}
