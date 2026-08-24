import { loadLocalBoardOverrides, LocalBoardOverride } from './board.local-image.util';

export interface BoardOwnState {
  loadError: string | null;
  /** Cảnh báo lưu trữ gần nhất (vỡ quota localStorage) — Workspace đọc để hiện toast. */
  storageWarning: string | null;
  /** Id của board đang mở (trang Board) — `null` khi chưa nạp/không tồn tại. */
  currentBoardId: string | null;
  /** Id các board thuộc phạm vi 1 workspace — nguồn cho `boards()`. */
  workspaceBoardIds: string[];
  /** Id các board gộp mọi workspace — nguồn cho `allBoards()` (Dashboard Chat hub). */
  allBoardIds: string[];
  /** Override cục bộ (màu/ảnh nền) chưa/không có ở server — xem `board.local-image.util.ts`. */
  localOverrides: Record<string, LocalBoardOverride>;
}

export const initialBoardState: BoardOwnState = {
  loadError: null,
  storageWarning: null,
  currentBoardId: null,
  workspaceBoardIds: [],
  allBoardIds: [],
  localOverrides: loadLocalBoardOverrides(),
};
