import { computed } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

/**
 * "Đang xem tổ chức nào, board nào" — ngữ cảnh lấy từ URL.
 *
 * Vì sao tách riêng thay vì để trong `OrganizationStore`:
 *
 * Gần như store nào cũng cần biết org/board hiện tại (workspace lọc theo org,
 * list lọc theo board, chat theo board...). Nếu `activeOrgId` nằm trong
 * `OrganizationStore` thì `ListStore` phải inject `OrganizationStore` chỉ để đọc
 * một chuỗi — kéo theo phụ thuộc vòng và khiến ba miền dính chặt vào nhau.
 *
 * Store này cố tình "ngu": chỉ giữ id, không gọi API, không biết tổ chức đó tên
 * gì. Tra cứu chi tiết là việc của store từng miền.
 */
export interface RouteContextState {
  /** Tổ chức đang mở, lấy từ slug trên URL. */
  activeOrgId: string | null;
  /** Board đang mở. Null khi ở Dashboard hoặc trang cài đặt. */
  activeBoardId: string | null;
}

const initialState: RouteContextState = {
  activeOrgId: null,
  activeBoardId: null,
};

export const RouteContextStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),

  withComputed(({ activeOrgId, activeBoardId }) => ({
    hasOrg: computed(() => activeOrgId() !== null),
    hasBoard: computed(() => activeBoardId() !== null),
  })),

  withMethods((store) => ({
    setActiveOrg(orgId: string | null): void {
      // Đổi tổ chức thì board cũ chắc chắn không còn thuộc ngữ cảnh nữa. Quên
      // xoá là trang Board vẫn hiện board của tổ chức trước sau khi chuyển.
      if (store.activeOrgId() === orgId) return;
      patchState(store, { activeOrgId: orgId, activeBoardId: null });
    },

    setActiveBoard(boardId: string | null): void {
      patchState(store, { activeBoardId: boardId });
    },

    /** Đăng xuất → quên hết ngữ cảnh, tránh người sau thấy board của người trước. */
    clear(): void {
      patchState(store, initialState);
    },
  })),
);
