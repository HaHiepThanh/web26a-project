import { signalStore, withMethods, withState } from '@ngrx/signals';
import { withErrorState } from '../shared/error.feature';
import { initialManageWorkspaceState } from './manage-workspace.state';
import { manageWorkspaceMethods } from './manage-workspace.methods';

/**
 * Thành viên của từng board — phục vụ màn `Settings → Manage Workspace`.
 *
 * Miền này nhỏ có lý do: gần như mọi thứ màn đó cần đã nằm ở store khác rồi
 * (`BoardStore` có board, `CardStore` có thẻ được giao, `ListStore` có tên cột,
 * `OrganizationStore` có vai trò + lời mời). Thứ DUY NHẤT chưa ai giữ là kết
 * quả `GET /boards/:id/members`, nên chỉ chừng ấy nằm ở đây.
 *
 * Không có handler WebSocket: backend chưa phát sự kiện nào cho `board_members`,
 * và `realtime.service.ts` là file đóng (xem bảng ranh giới trong
 * `docs/ngrx/HOANG-the-va-noi-dung.md`). Màn này nạp lại khi mở, thế là đủ —
 * nó là màn cài đặt, không phải bảng làm việc thời gian thực.
 *
 * Ghép trực tiếp `withMethods` tại đây thay vì bọc `signalStoreFeature` riêng —
 * cùng lý do đã ghi ở `ngrx/list/list.store.ts` (lỗi suy luận kiểu ngrx#4274).
 */
export const ManageWorkspaceStore = signalStore(
  { providedIn: 'root' },
  withState(initialManageWorkspaceState),
  withErrorState(),
  withMethods((store) => manageWorkspaceMethods(store)),
);
