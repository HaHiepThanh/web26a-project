import { Injectable, computed, signal } from '@angular/core';
import { Board, BoardBackground, BoardVisibility, User } from '../models';

let boardIdSeq = 1;

/** Board người dùng tạo được lưu lại để F5 không mất tên/nền/quyền riêng tư.
 *  Đây là nơi DUY NHẤT giữ ảnh nền (base64) — trang Workspace đọc lại qua
 *  `backgroundImageByBoardId` chứ không lưu thêm bản sao, tránh nhân đôi dung lượng. */
const STORAGE_KEY_BOARDS = 'trello_boards';

function loadStoredBoards(): Record<string, Board> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const saved = localStorage.getItem(STORAGE_KEY_BOARDS);
    if (!saved) return {};
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, Board>) : {};
  } catch {
    return {};
  }
}

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

/** Thành viên tenant giả lập — dùng làm nguồn chọn "Người phụ trách" (#2) tới khi có API thật.
 *  Export để các mock khác (vd: components/board/workspace-stats-modal/board-stats.mock.ts)
 *  dùng chung đúng 1 roster, tránh lệch id/tên giữa các màn. */
export const MOCK_MEMBERS: User[] = [
  // -- Dữ liệu mẫu đã comment để test từ tài khoản trắng hoàn toàn — bỏ comment để khôi phục --
  // { id: 'u-nam', email: 'nam@trello.dev', displayName: 'Nam' },
  // { id: 'u-linh', email: 'linh@trello.dev', displayName: 'Linh' },
  // { id: 'u-khoa', email: 'khoa@trello.dev', displayName: 'Khoa' },
  // { id: 'u-my', email: 'my@trello.dev', displayName: 'My' },
  // { id: 'u-bao', email: 'bao@trello.dev', displayName: 'Bảo' },
];

/** CRUD board + visibility (#3). Hiện dùng dữ liệu giả (chưa nối backend thật). */
@Injectable({ providedIn: 'root' })
export class BoardService {
  readonly boards = signal<Board[]>([]); // danh sách board trong 1 workspace
  /** Toàn bộ board của tôi (gộp mọi workspace) — dùng cho Dashboard Chat (#chat-hub),
   *  tách riêng khỏi `boards` (scope 1-workspace) để không đè lẫn nhau. */
  readonly allBoards = signal<Board[]>([]);
  readonly currentBoard = signal<Board | null>(null);
  /** Cảnh báo lưu trữ gần nhất (vỡ quota localStorage) — trang Workspace đọc để hiện toast. */
  readonly storageWarning = signal<string | null>(null);
  readonly members = signal<User[]>(MOCK_MEMBERS);

  /** Board người dùng đã tạo, khôi phục từ localStorage lúc khởi động — để tên/nền/quyền
   *  riêng tư không bị mất khi điều hướng sang trang Board HAY khi F5. */
  private readonly createdBoards = signal<Record<string, Board>>(loadStoredBoards());

  /** Ảnh nền theo boardId — trang Workspace dùng để vẽ tile mà không phải lưu thêm
   *  một bản base64 thứ hai trong danh sách workspace. */
  readonly backgroundImageByBoardId = computed(() => {
    const result: Record<string, string | undefined> = {};
    for (const [id, board] of Object.entries(this.createdBoards())) {
      if (board.backgroundImageUrl) result[id] = board.backgroundImageUrl;
    }
    return result;
  });

  /** Ghi xuống localStorage. Trả về false khi vỡ quota (ảnh nền base64 rất nặng) để
   *  phía gọi còn báo cho người dùng, thay vì nuốt lỗi rồi mất dữ liệu âm thầm. */
  private persist(): boolean {
    if (typeof localStorage === 'undefined') return true;
    try {
      localStorage.setItem(STORAGE_KEY_BOARDS, JSON.stringify(this.createdBoards()));
      return true;
    } catch {
      return false;
    }
  }

  // TODO: khi có backend thật, gọi ApiService.get(`/workspaces/${workspaceId}/boards`) thay vì mock.
  async loadBoards(workspaceId: string): Promise<void> {}

  /** Gộp board của TẤT CẢ workspace — cho Dashboard Chat hub liệt kê mọi hội thoại. */
  async loadAllBoards(): Promise<void> {
    this.allBoards.set(Object.values(this.createdBoards()));
  }

  /** Dựng Board từ :id — chỉ board đã tạo trong phiên này (createBoard); id lạ → null. */
  async loadBoard(boardId: string): Promise<void> {
    this.currentBoard.set(this.createdBoards()[boardId] ?? null);
  }

  async createBoard(
    workspaceId: string,
    name: string,
    options?: { visibility?: BoardVisibility; background?: BoardBackground; backgroundImageUrl?: string },
  ): Promise<Board | null> {
    const title = name.trim();
    if (!title) return null;
    const board: Board = {
      id: `b-new-${Date.now()}-${boardIdSeq++}`,
      tenantId: 'tenant-demo',
      workspaceId,
      name: title,
      visibility: options?.visibility ?? 'public',
      background: options?.background,
      backgroundImageUrl: options?.backgroundImageUrl,
      createdBy: CURRENT_USER_ID,
      createdAt: new Date().toISOString(),
    };
    this.createdBoards.update((map) => ({ ...map, [board.id]: board }));
    this.persistOrDropImage(board.id);
    return this.createdBoards()[board.id];
  }

  async updateBoard(id: string, changes: Partial<Pick<Board, 'name' | 'visibility' | 'background' | 'backgroundImageUrl'>>): Promise<void> {
    this.createdBoards.update((map) => (map[id] ? { ...map, [id]: { ...map[id], ...changes } } : map));
    if (this.currentBoard()?.id === id) this.currentBoard.update((b) => (b ? { ...b, ...changes } : b));
    this.persistOrDropImage(id);
  }

  /** Ảnh nền base64 có thể làm vỡ quota localStorage (~5MB). Nếu vỡ, bỏ ảnh rồi lưu
   *  lại: thà mất ảnh nền còn hơn mất luôn cả board (dùng chung cho tạo mới lẫn sửa). */
  private persistOrDropImage(boardId: string): void {
    this.storageWarning.set(null);
    if (this.persist()) return;
    const board = this.createdBoards()[boardId];
    if (!board?.backgroundImageUrl) return;
    this.createdBoards.update((map) => ({ ...map, [boardId]: { ...map[boardId], backgroundImageUrl: undefined } }));
    this.persist();
    this.storageWarning.set('Bộ nhớ trình duyệt đã đầy — đã lưu board nhưng ảnh nền không lưu được.');
  }

  async deleteBoard(id: string): Promise<void> {
    this.createdBoards.update((map) => {
      const next = { ...map };
      delete next[id];
      return next;
    });
    this.persist();
  }
}
