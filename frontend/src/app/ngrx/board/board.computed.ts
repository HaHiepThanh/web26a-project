import { computed, inject, Signal } from '@angular/core';
import { Board } from '../../models';
import { OrganizationService } from '../../services/organization.service';
import { BoardOwnState } from './board.state';

/** Hàm generic thuần — xem chú thích trong `ngrx/list/list.computed.ts` về lý
 *  do không tự bọc `signalStoreFeature` riêng cho từng file. */
export function boardComputed(store: {
  entities: Signal<Board[]>;
  workspaceBoardIds: Signal<string[]>;
  allBoardIds: Signal<string[]>;
  currentBoardId: Signal<string | null>;
  localOverrides: Signal<BoardOwnState['localOverrides']>;
}) {
  // Thành viên dùng cho ô "Người phụ trách", avatar chat... — lấy từ tổ chức
  // đang mở (`OrganizationService`, phần của Huy). Board không giữ bản sao.
  const organizations = inject(OrganizationService);

  const byId = computed(() => {
    const map: Record<string, Board | undefined> = {};
    for (const b of store.entities()) map[b.id] = b;
    return map;
  });

  return {
    /** Board trong 1 workspace (nạp lần gần nhất qua `loadBoards`). */
    boards: computed(() =>
      store
        .workspaceBoardIds()
        .map((id) => byId()[id])
        .filter((b): b is Board => !!b),
    ),
    /** Board của TẤT CẢ workspace — Dashboard Chat hub. */
    allBoards: computed(() =>
      store
        .allBoardIds()
        .map((id) => byId()[id])
        .filter((b): b is Board => !!b),
    ),
    currentBoard: computed(() => {
      const id = store.currentBoardId();
      return id ? (byId()[id] ?? null) : null;
    }),
    /** Ảnh nền theo boardId — Workspace vẽ tile mà không phải lưu thêm bản base64. */
    backgroundImageByBoardId: computed(() => {
      const result: Record<string, string | undefined> = {};
      for (const [id, local] of Object.entries(store.localOverrides())) {
        if (local.backgroundImageUrl) result[id] = local.backgroundImageUrl;
      }
      return result;
    }),
    members: computed(() => organizations.membersOf(organizations.activeOrgId()).map((m) => m.user)),
  };
}
