import { BoardBackground } from '../models/board.model';

export type Privacy = 'Workspace' | 'Private' | 'Public';
export type ToastType = 'success' | 'error' | 'info';

export interface WorkspaceMember {
  id: string; // uuid
  displayName: string;
  email: string;
  role: 'owner' | 'member';
  avatarUrl?: string;
}

export interface BoardItem {
  id: string;
  title: string;
  tag: string;
  privacy: Privacy;
  badge: string;
  starred: boolean;
  bgClass: BoardBackground;
}

export interface WorkspaceItem {
  id: string;
  name: string;
  icon: string;
  iconBg: BoardBackground;
  membersCount: number;
  members: WorkspaceMember[];
  description: string;
  boards: BoardItem[];
}

export interface Template {
  title: string;
  desc: string;
  badge: string;
  badgeClass: string;
  columns: number;
}

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  action?: { label: string; handler: () => void };
}

export interface TrashedBoard {
  board: BoardItem;
  workspaceId: string;
  workspaceName: string;
  originalIndex: number;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

const AVATAR_COLORS = ['#0284c7', '#7c3aed', '#059669', '#ea580c', '#dc2626', '#0d9488', '#4f46e5'];

export function avatarBgFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export const STORAGE_KEY_WORKSPACES = 'trello_workspaces_data';

export function initialMockWorkspaces(): WorkspaceItem[] {
  return [
    {
      id: 'ws-1',
      name: 'Đồ án Tốt nghiệp CNTT',
      icon: '🎓',
      iconBg: 'bg-board-blue',
      membersCount: 3,
      members: [
        {
          id: '8f4c2e10-9b3a-4e2a-871d-5b3a1a2e3f40',
          displayName: 'Nguyễn Văn Nam',
          email: 'nam.nguyen@trello.dev',
          role: 'owner',
        },
        {
          id: '3c7d1e45-8a2f-4c9b-b01e-7f6d5c4b3a21',
          displayName: 'Trần Thị Linh',
          email: 'linh.tran@trello.dev',
          role: 'member',
        },
        {
          id: 'e2b5c710-4d8a-493e-91c2-6a8b0e5d4f12',
          displayName: 'Lê Hoàng Khoa',
          email: 'khoa.le@trello.dev',
          role: 'member',
        },
      ],
      description: 'Workspace quản lý toàn bộ các công việc nghiên cứu và phát triển phần mềm đồ án tốt nghiệp khóa K22.',
      boards: [
        { id: 'b-1', title: 'Hệ thống Quản lý Kanban', tag: 'ĐỒ ÁN TỐT NGHIỆP CNTT', privacy: 'Workspace', badge: 'KANBAN', starred: true, bgClass: 'bg-board-purple' },
        { id: 'b-2', title: 'Ứng dụng tìm trọ thông minh', tag: 'ĐỒ ÁN TỐT NGHIỆP CNTT', privacy: 'Private', badge: 'KANBAN', starred: false, bgClass: 'bg-board-teal' },
        { id: 'b-3', title: 'Kế hoạch Tuần cá nhân', tag: 'ĐỒ ÁN TỐT NGHIỆP CNTT', privacy: 'Workspace', badge: 'KANBAN', starred: false, bgClass: 'bg-board-blue' },
      ],
    },
    {
      id: 'ws-2',
      name: 'Dự án Khởi nghiệp SaaS',
      icon: '🚀',
      iconBg: 'bg-board-purple',
      membersCount: 2,
      members: [
        {
          id: '8f4c2e10-9b3a-4e2a-871d-5b3a1a2e3f40',
          displayName: 'Nguyễn Văn Nam',
          email: 'nam.nguyen@trello.dev',
          role: 'owner',
        },
        {
          id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          displayName: 'Phạm Thảo My',
          email: 'my.pham@trello.dev',
          role: 'member',
        },
      ],
      description: 'Không gian làm việc cho dự án SaaS khởi nghiệp sinh viên.',
      boards: [
        { id: 'b-4', title: 'Sản phẩm MVP v1.0', tag: 'DỰ ÁN KHỞI NGHIỆP SAAS', privacy: 'Public', badge: 'KANBAN', starred: true, bgClass: 'bg-board-orange' },
      ],
    },
  ];
}

export function loadStoredWorkspaces(): WorkspaceItem[] {
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_WORKSPACES);
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

export function persistWorkspaces(list: WorkspaceItem[]): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_WORKSPACES, JSON.stringify(list));
    } catch {}
  }
}

export const WORKSPACE_TEMPLATES: Template[] = [
  { title: 'Quản lý Dự án Agile', desc: 'Quy trình chuẩn Backlog, Doing, Review, Done cho phần mềm.', badge: '1', badgeClass: 'badge-blue', columns: 4 },
  { title: 'Kế hoạch Tuần cá nhân', desc: 'Quản lý các đầu việc từ Thứ 2 đến Chủ nhật.', badge: '2', badgeClass: 'badge-green', columns: 5 },
  { title: 'Phát hành Marketing Campaign', desc: 'Lên ý tưởng, thiết kế asset và quảng bá sản phẩm.', badge: '3', badgeClass: 'badge-orange', columns: 4 },
];
