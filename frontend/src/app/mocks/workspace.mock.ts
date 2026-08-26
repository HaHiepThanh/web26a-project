import { BoardBackground } from '../models/board.model';
import { avatarColorFor } from '../utils/avatar.util';

import {
  BoardItem,
  Privacy,
  Template,
  Toast,
  ToastType,
  TrashedBoard,
  WorkspaceItem,
  WorkspaceMember,
  WorkspaceWithOrg,
} from '../models';

// Các kiểu trên đã chuyển sang models/workspace-item.model.ts và models/toast.model.ts.
// Re-export để chỗ nào còn import từ đây vẫn chạy.
export type {
  BoardItem,
  Privacy,
  Template,
  Toast,
  ToastType,
  TrashedBoard,
  WorkspaceItem,
  WorkspaceMember,
  WorkspaceWithOrg,
};









export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// Bảng màu riêng của module này (7 màu) khác với utils/avatar.util.ts (6 màu) khiến
// cùng một user ra hai màu avatar khác nhau tuỳ nơi hiển thị (card board vs. card
// workspace) — dùng chung `avatarColorFor` để avatar đồng bộ màu xuyên suốt ứng dụng.
export const avatarBgFor = avatarColorFor;

export const STORAGE_KEY_WORKSPACES = 'trello_workspaces_data';

/** Từ khi có Organization (multi-tenant nhiều thành viên): Workspace được lưu
 *  DÙNG CHUNG theo orgId (không còn tách theo userId) — vì 1 Organization có thể
 *  có nhiều thành viên và tất cả phải thấy chung 1 bộ Workspace/Board của tổ
 *  chức đó, giống cách Supabase chia dữ liệu theo tenant. orgId luôn là duy nhất
 *  toàn cục nên việc bỏ userId khỏi key không làm mất tính cô lập giữa các
 *  Organization — chỉ khi chưa đăng nhập/chưa có org mới rơi về key "guest".
 *  Tham số userId được giữ lại trong chữ ký hàm để không phải sửa các nơi gọi. */
function storageKeyFor(userId?: string | null, orgId?: string | null): string {
  const orgPart = orgId ?? `guest_${userId ?? 'anon'}`;
  return `${STORAGE_KEY_WORKSPACES}_${orgPart}`;
}

export function initialMockWorkspaces(): WorkspaceItem[] {
  // -- Dữ liệu mẫu đã comment để test từ tài khoản trắng hoàn toàn — bỏ comment để khôi phục --
  // return [
  //   {
  //     id: 'ws-1',
  //     name: 'Đồ án Tốt nghiệp CNTT',
  //     icon: '🎓',
  //     iconBg: 'bg-board-blue',
  //     membersCount: 3,
  //     members: [
  //       {
  //         id: '8f4c2e10-9b3a-4e2a-871d-5b3a1a2e3f40',
  //         displayName: 'Nguyễn Văn Nam',
  //         email: 'nam.nguyen@trello.dev',
  //         role: 'owner',
  //       },
  //       {
  //         id: '3c7d1e45-8a2f-4c9b-b01e-7f6d5c4b3a21',
  //         displayName: 'Trần Thị Linh',
  //         email: 'linh.tran@trello.dev',
  //         role: 'member',
  //       },
  //       {
  //         id: 'e2b5c710-4d8a-493e-91c2-6a8b0e5d4f12',
  //         displayName: 'Lê Hoàng Khoa',
  //         email: 'khoa.le@trello.dev',
  //         role: 'member',
  //       },
  //     ],
  //     description: 'Workspace quản lý toàn bộ các công việc nghiên cứu và phát triển phần mềm đồ án tốt nghiệp khóa K22.',
  //     boards: [
  //       { id: 'b-1', title: 'Hệ thống Quản lý Kanban', tag: 'ĐỒ ÁN TỐT NGHIỆP CNTT', privacy: 'Workspace', badge: 'KANBAN', starred: true, bgClass: 'bg-board-purple' },
  //       { id: 'b-2', title: 'Ứng dụng tìm trọ thông minh', tag: 'ĐỒ ÁN TỐT NGHIỆP CNTT', privacy: 'Private', badge: 'KANBAN', starred: false, bgClass: 'bg-board-teal' },
  //       { id: 'b-3', title: 'Kế hoạch Tuần cá nhân', tag: 'ĐỒ ÁN TỐT NGHIỆP CNTT', privacy: 'Workspace', badge: 'KANBAN', starred: false, bgClass: 'bg-board-blue' },
  //     ],
  //   },
  //   {
  //     id: 'ws-2',
  //     name: 'Dự án Khởi nghiệp SaaS',
  //     icon: '🚀',
  //     iconBg: 'bg-board-purple',
  //     membersCount: 2,
  //     members: [
  //       {
  //         id: '8f4c2e10-9b3a-4e2a-871d-5b3a1a2e3f40',
  //         displayName: 'Nguyễn Văn Nam',
  //         email: 'nam.nguyen@trello.dev',
  //         role: 'owner',
  //       },
  //       {
  //         id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  //         displayName: 'Phạm Thảo My',
  //         email: 'my.pham@trello.dev',
  //         role: 'member',
  //       },
  //     ],
  //     description: 'Không gian làm việc cho dự án SaaS khởi nghiệp sinh viên.',
  //     boards: [
  //       { id: 'b-4', title: 'Sản phẩm MVP v1.0', tag: 'DỰ ÁN KHỞI NGHIỆP SAAS', privacy: 'Public', badge: 'KANBAN', starred: true, bgClass: 'bg-board-orange' },
  //     ],
  //   },
  // ];
  return [];
}

export function loadStoredWorkspaces(userId?: string | null, orgId?: string | null): WorkspaceItem[] {
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem(storageKeyFor(userId, orgId));
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
  }
  return initialMockWorkspaces();
}


export function loadAllWorkspacesForUser(
  userId?: string | null,
  organizations: { id: string; name: string }[] = [],
): WorkspaceWithOrg[] {
  const result: WorkspaceWithOrg[] = [];
  const seenIds = new Set<string>();

  // If user has personal/guest workspaces
  const guestList = loadStoredWorkspaces(userId, null);
  for (const ws of guestList) {
    if (!seenIds.has(ws.id)) {
      seenIds.add(ws.id);
      result.push({ ...ws, orgId: '', orgName: 'Personal' });
    }
  }

  // Load from each organization
  for (const org of organizations) {
    const list = loadStoredWorkspaces(userId, org.id);
    for (const ws of list) {
      if (!seenIds.has(ws.id)) {
        seenIds.add(ws.id);
        result.push({ ...ws, orgId: org.id, orgName: org.name });
      }
    }
  }

  return result;
}

export function persistWorkspaces(list: WorkspaceItem[], userId?: string | null, orgId?: string | null): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(storageKeyFor(userId, orgId), JSON.stringify(list));
    } catch {}
  }
}

export const WORKSPACE_TEMPLATES: Template[] = [
  { title: 'Quản lý Dự án Agile', desc: 'Quy trình chuẩn Backlog, Doing, Review, Done cho phần mềm.', badge: '1', badgeClass: 'badge-blue', columns: 4 },
  { title: 'Kế hoạch Tuần cá nhân', desc: 'Quản lý các đầu việc từ Thứ 2 đến Chủ nhật.', badge: '2', badgeClass: 'badge-green', columns: 5 },
  { title: 'Phát hành Marketing Campaign', desc: 'Lên ý tưởng, thiết kế asset và quảng bá sản phẩm.', badge: '3', badgeClass: 'badge-orange', columns: 4 },
];
