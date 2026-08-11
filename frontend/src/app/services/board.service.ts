import { Injectable, signal } from '@angular/core';
import { Board, User } from '../models';

/** Bảng màu avatar cố định theo id — dùng chung cho card assignee + avatar stack. */
const AVATAR_PALETTE = ['#0284c7', '#7c3aed', '#059669', '#ea580c', '#dc2626', '#0d9488'];

export function avatarColorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** "2 phút trước / Hôm qua"... — khác timeLabel của MessageItem (chỉ giờ:phút),
 *  dùng cho danh sách hội thoại Dashboard Chat cần mốc tương đối (#chat-hub). */
export function relativeTimeFrom(iso: string): string {
  const diffMs = Date.now() - Date.parse(iso);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Hôm qua';
  if (days < 7) return `${days} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN');
}

/** "Bạn" trong toàn bộ demo (chat, banner nhắc hạn, dashboard "việc của tôi") —
 *  tới khi AuthService/Firebase thật được bật, dùng tạm 1 thành viên mock cố định. */
export const CURRENT_USER_ID = 'u-nam';

/** Thành viên tenant giả lập — dùng làm nguồn chọn "Người phụ trách" (#2) tới khi có API thật. */
const MOCK_MEMBERS: User[] = [
  { id: 'u-nam', email: 'nam@trello.dev', displayName: 'Nam' },
  { id: 'u-linh', email: 'linh@trello.dev', displayName: 'Linh' },
  { id: 'u-khoa', email: 'khoa@trello.dev', displayName: 'Khoa' },
  { id: 'u-my', email: 'my@trello.dev', displayName: 'My' },
  { id: 'u-bao', email: 'bao@trello.dev', displayName: 'Bảo' },
];

/** Board giả lập gộp mọi workspace — nguồn cho Dashboard Chat hub (#chat-hub) liệt kê
 *  hội thoại. id b-1..b-4 khớp với MESSAGE_SETS trong chat.service để mỗi board có
 *  preview tin nhắn khác nhau. */
const MOCK_ALL_BOARDS: Board[] = [
  { id: 'b-1', name: 'Hệ thống Quản lý Kanban', tenantId: 'tenant-demo', workspaceId: 'ws-1', visibility: 'public', createdBy: 'u-nam', createdAt: new Date().toISOString() },
  { id: 'b-2', name: 'App Tìm trọ Sinh viên', tenantId: 'tenant-demo', workspaceId: 'ws-1', visibility: 'restricted', createdBy: 'u-nam', createdAt: new Date().toISOString() },
  { id: 'b-3', name: 'Website Câu lạc bộ', tenantId: 'tenant-demo', workspaceId: 'ws-2', visibility: 'restricted', createdBy: 'u-nam', createdAt: new Date().toISOString() },
  { id: 'b-4', name: 'Demo MVP cho nhà đầu tư', tenantId: 'tenant-demo', workspaceId: 'ws-2', visibility: 'public', createdBy: 'u-nam', createdAt: new Date().toISOString() },
];

/** CRUD board + visibility (#3). Hiện dùng dữ liệu giả (chưa nối backend thật). */
@Injectable({ providedIn: 'root' })
export class BoardService {
  readonly boards = signal<Board[]>([]); // danh sách board trong 1 workspace
  /** Toàn bộ board của tôi (gộp mọi workspace) — dùng cho Dashboard Chat (#chat-hub),
   *  tách riêng khỏi `boards` (scope 1-workspace) để không đè lẫn nhau. */
  readonly allBoards = signal<Board[]>([]);
  readonly currentBoard = signal<Board | null>(null);
  readonly members = signal<User[]>(MOCK_MEMBERS);

  // TODO: khi có backend thật, gọi ApiService.get(`/workspaces/${workspaceId}/boards`) thay vì mock.
  async loadBoards(workspaceId: string): Promise<void> {}

  /** Gộp board của TẤT CẢ workspace — cho Dashboard Chat hub liệt kê mọi hội thoại. */
  async loadAllBoards(): Promise<void> {
    this.allBoards.set(MOCK_ALL_BOARDS);
  }

  /** Mock: dựng 1 Board tối thiểu từ :id trên route để trang /board/:id có gì đó để hiển thị. */
  async loadBoard(boardId: string): Promise<void> {
    this.currentBoard.set({
      id: boardId,
      tenantId: 'tenant-demo',
      workspaceId: 'ws-1',
      name: 'Hệ thống Quản lý Kanban',
      visibility: 'public',
      createdBy: MOCK_MEMBERS[0].id,
      createdAt: new Date().toISOString(),
    });
  }

  async createBoard(workspaceId: string, name: string): Promise<Board | null> {
    return null;
  }

  async updateBoard(id: string, changes: Partial<Pick<Board, 'name' | 'visibility'>>): Promise<void> {}

  async deleteBoard(id: string): Promise<void> {}
}
