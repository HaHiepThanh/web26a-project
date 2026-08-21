import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { describeError } from './api-error.util';
import {
  ApiBoard,
  Board,
  BoardBackground,
  BoardVisibility,
  User,
} from '../models';
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

/** Thành viên tổ chức giả lập — dùng làm nguồn chọn "Người phụ trách" (#2) tới khi có API thật.
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

/**
 * CRUD board + visibility (#3) — GỌI BACKEND THẬT.
 *
 * Còn một phần ở localStorage: `background` và `backgroundImageUrl`. Backend
 * hiện chưa nhận hai trường này (`POST /boards` chỉ nhận `workspaceId` + `name`,
 * `PATCH /boards/:id` chỉ nhận `name` + `visibility`), nên màu/ảnh nền vẫn giữ
 * ở trình duyệt, khoá theo ĐÚNG id board thật do server cấp.
 */
@Injectable({ providedIn: 'root' })
export class BoardService {
  private readonly api = inject(ApiService);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
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

  /** Ghép dữ liệu backend + màu/ảnh nền đang giữ ở trình duyệt. */
  private toBoard(row: ApiBoard): Board {
    const local = this.createdBoards()[row.id];
    return {
      id: row.id,
      orgId: row.orgId,
      workspaceId: row.workspaceId,
      name: row.name,
      visibility: row.visibility,
      background: local?.background,
      backgroundImageUrl: local?.backgroundImageUrl,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    };
  }

  async loadBoards(workspaceId: string): Promise<void> {
    if (!workspaceId) {
      this.boards.set([]);
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const rows = await this.api.get<ApiBoard[]>(`/boards?workspaceId=${workspaceId}`);
      this.boards.set(rows.map((r) => this.toBoard(r)));
    } catch (e) {
      this.loadError.set(describeError(e, 'Không tải được danh sách board.'));
      this.boards.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  /** Gộp board của TẤT CẢ workspace — cho Dashboard Chat hub liệt kê mọi hội thoại. */
  async loadAllBoards(workspaceIds: string[] = []): Promise<void> {
    if (!workspaceIds.length) {
      this.allBoards.set([]);
      return;
    }
    const perWorkspace = await Promise.all(
      workspaceIds.map((id) =>
        this.api.get<ApiBoard[]>(`/boards?workspaceId=${id}`).catch(() => [] as ApiBoard[]),
      ),
    );
    this.allBoards.set(perWorkspace.flat().map((r) => this.toBoard(r)));
  }

  /** Nạp 1 board theo id — dùng cho trang Board mở thẳng từ link chia sẻ. */
  async loadBoard(boardId: string): Promise<void> {
    this.loadError.set(null);
    try {
      const row = await this.api.get<ApiBoard>(`/boards/${boardId}`);
      this.currentBoard.set(this.toBoard(row));
    } catch (e) {
      // 404 = không tồn tại HOẶC không thuộc tổ chức của mình — backend cố ý gộp
      // hai trường hợp để người ngoài không dò được id nào có thật.
      this.currentBoard.set(null);
      this.loadError.set(describeError(e, 'Không mở được board.'));
    }
  }

  async createBoard(
    workspaceId: string,
    name: string,
    options?: { visibility?: BoardVisibility; background?: BoardBackground; backgroundImageUrl?: string },
  ): Promise<Board | null> {
    const title = name.trim();
    if (!title) return null;

    let row: ApiBoard;
    try {
      // Backend chỉ nhận workspaceId + name. Id do SERVER cấp — không tự sinh
      // 'b-new-...' nữa, id tự chế sẽ không khớp gì với database.
      row = await this.api.post<ApiBoard>('/boards', { workspaceId, name: title });
    } catch (e) {
      this.loadError.set(describeError(e, 'Không tạo được board.'));
      return null;
    }

    // visibility là bước thứ hai vì POST không nhận. Hỏng thì board vẫn còn với
    // giá trị mặc định 'workspace' — báo cho người dùng chứ không nuốt lỗi.
    if (options?.visibility && options.visibility !== row.visibility) {
      try {
        row = await this.api.patch<ApiBoard>(`/boards/${row.id}`, {
          visibility: options.visibility,
        });
      } catch {
        this.loadError.set('Đã tạo board nhưng chưa đặt được quyền riêng tư.');
      }
    }

    // Màu/ảnh nền backend chưa lưu được → giữ ở trình duyệt, khoá theo id THẬT.
    const board: Board = {
      ...this.toBoard(row),
      background: options?.background,
      backgroundImageUrl: options?.backgroundImageUrl,
    };
    this.createdBoards.update((map) => ({ ...map, [board.id]: board }));
    this.persistOrDropImage(board.id);
    this.boards.update((list) => [...list, this.createdBoards()[board.id]]);
    return this.createdBoards()[board.id];
  }

  async updateBoard(
    id: string,
    changes: Partial<Pick<Board, 'name' | 'visibility' | 'background' | 'backgroundImageUrl'>>,
  ): Promise<string | null> {
    // Chỉ 2 trường này backend nhận; gửi thừa sẽ bị ValidationPipe loại bỏ.
    const patch: { name?: string; visibility?: BoardVisibility } = {};
    if (changes.name !== undefined) patch.name = changes.name;
    if (changes.visibility !== undefined) patch.visibility = changes.visibility;

    if (Object.keys(patch).length > 0) {
      try {
        await this.api.patch<ApiBoard>(`/boards/${id}`, patch);
      } catch (e) {
        return describeError(e, 'Không sửa được board.');
      }
    }

    this.createdBoards.update((map) => (map[id] ? { ...map, [id]: { ...map[id], ...changes } } : map));
    this.boards.update((list) => list.map((b) => (b.id === id ? { ...b, ...changes } : b)));
    if (this.currentBoard()?.id === id) this.currentBoard.update((b) => (b ? { ...b, ...changes } : b));
    this.persistOrDropImage(id);
    return null;
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

  async deleteBoard(id: string): Promise<string | null> {
    // Xoá trên server TRƯỚC. Xoá ở giao diện trước rồi server hỏng là danh sách
    // trên màn hình lệch với database cho tới lần F5 kế tiếp.
    try {
      await this.api.delete(`/boards/${id}`);
    } catch (e) {
      return describeError(e, 'Không xoá được board.');
    }
    this.createdBoards.update((map) => {
      const next = { ...map };
      delete next[id];
      return next;
    });
    this.boards.update((list) => list.filter((b) => b.id !== id));
    this.persist();
    return null;
  }
}
