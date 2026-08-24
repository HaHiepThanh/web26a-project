import { Board, BoardBackground } from '../../models';

/**
 * TODO(ảnh nền board): `boards.background_image_path` ở database đang chờ một
 * đường dẫn Supabase Storage, chưa có endpoint upload — xem
 * `backend/docs/API-BO-SUNG.md`. Tới lúc đó, ẢNH nền (base64) vẫn phải nằm ở
 * localStorage như trước. Theo đúng mục 6 của `docs/ngrx/HOA-board-cong-tac.md`:
 * "Đừng migrate chỗ này vào store — để nguyên như cũ" — file này chỉ CHUYỂN CHỖ
 * nguyên logic cũ của `board.service.ts`, không viết lại theo NgRx.
 *
 * MÀU nền (`background`) đã lên database qua `PATCH /boards/:id`; override ở
 * đây chỉ còn là phương án dự phòng cho board tạo trước khi cột đó tồn tại.
 */
const STORAGE_KEY_BOARDS = 'trello_boards';

export interface LocalBoardOverride {
  background?: BoardBackground;
  backgroundImageUrl?: string;
}

export function loadLocalBoardOverrides(): Record<string, LocalBoardOverride> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const saved = localStorage.getItem(STORAGE_KEY_BOARDS);
    if (!saved) return {};
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, LocalBoardOverride>) : {};
  } catch {
    return {};
  }
}

/** Ghi xuống localStorage. `false` khi vỡ quota (ảnh nền base64 rất nặng). */
export function persistLocalBoardOverrides(map: Record<string, LocalBoardOverride>): boolean {
  if (typeof localStorage === 'undefined') return true;
  try {
    localStorage.setItem(STORAGE_KEY_BOARDS, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

export function mergeLocalOverride(board: Board, local: LocalBoardOverride | undefined): Board {
  if (!local) return board;
  return {
    ...board,
    background: board.background ?? local.background,
    backgroundImageUrl: local.backgroundImageUrl,
  };
}
