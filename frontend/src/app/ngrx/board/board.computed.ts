import { computed, inject, Signal } from '@angular/core';
import { Board } from '../../models';
import { OrganizationStore } from '../organization/organization.store';
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
  // đang mở (`OrganizationStore`, phần của Huy). Board không giữ bản sao.
  const organizations = inject(OrganizationStore);

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
    /**
     * Ảnh nền theo boardId — Workspace vẽ tile mà không phải giữ thêm bản sao.
     *
     * ⚠️ Đọc TỪ ENTITY TRƯỚC, localStorage chỉ là đường lui.
     *
     *    Trước đây hàm này chỉ nhìn `localOverrides`, tức bản base64 nằm trong
     *    máy người đặt ảnh. Hệ quả kép:
     *      • người khác mở Workspace không thấy ảnh nào (ảnh đâu có trên máy họ);
     *      • và sau khi ảnh chuyển lên Storage — lúc đó `localOverrides` được
     *        dọn đi vì đã thừa — thì chính người đặt cũng mất ảnh ở Workspace,
     *        trong khi trang Board vẫn hiện đúng vì nó đọc thẳng từ entity.
     *
     *    Hai trang đọc hai nguồn khác nhau chính là gốc của sự lệch đó. Giờ cả
     *    hai cùng lấy từ entity — nguồn mà server trả xuống.
     */
    backgroundImageByBoardId: computed(() => {
      const result: Record<string, string | undefined> = {};
      // Đường lui: board đặt nền TRƯỚC khi có endpoint upload, ảnh vẫn còn ở máy.
      for (const [id, local] of Object.entries(store.localOverrides())) {
        if (local.backgroundImageUrl) result[id] = local.backgroundImageUrl;
      }
      // Bản trên server thắng.
      for (const b of store.entities()) {
        if (b.backgroundImageUrl) result[b.id] = b.backgroundImageUrl;
      }
      return result;
    }),
    members: computed(() => organizations.membersOf(organizations.activeOrgId()).map((m) => m.user)),
  };
}
