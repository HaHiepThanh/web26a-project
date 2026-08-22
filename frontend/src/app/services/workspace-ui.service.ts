import { Injectable, signal } from '@angular/core';

/**
 * Yêu cầu mở modal do Header gửi sang trang Workspace.
 * Đọc một lần rồi mất (xem `consumeRequest`).
 */
export type WorkspaceUiRequest = 'create-board' | 'create-workspace';

/**
 * State dùng chung giữa Header và trang Workspace: ô tìm kiếm + nút "+ Tạo".
 *
 * ⚠️ Trước đây hai yêu cầu này là BỘ ĐẾM tăng dần (`createBoardRequests`,
 *    `createWorkspaceRequests`) và không bao giờ đặt lại về 0. Hậu quả:
 *
 *      1. Bấm "Tạo bảng" một lần → bộ đếm = 1 VĨNH VIỄN. Từ đó cứ mở lại trang
 *         Workspace là modal tự bật lên, dù người dùng không bấm gì.
 *      2. Lỡ bấm cả hai nút thì cả hai bộ đếm > 0 → hiện CÙNG LÚC hai modal.
 *
 *    Giờ là "một yêu cầu, đọc xong thì mất": không tích luỹ, và không thể có
 *    hai yêu cầu cùng tồn tại.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceUiService {
  readonly searchQuery = signal('');

  /** Yêu cầu đang chờ trang Workspace xử lý. `null` = không có gì. */
  readonly pendingRequest = signal<WorkspaceUiRequest | null>(null);

  setSearchQuery(value: string): void {
    this.searchQuery.set(value);
  }

  requestCreateBoard(): void {
    this.pendingRequest.set('create-board');
  }

  requestCreateWorkspace(): void {
    this.pendingRequest.set('create-workspace');
  }

  /** Lấy yêu cầu ra và xoá luôn — mỗi lần bấm nút chỉ mở đúng một modal, đúng một lần. */
  consumeRequest(): WorkspaceUiRequest | null {
    const req = this.pendingRequest();
    if (req) this.pendingRequest.set(null);
    return req;
  }

  /** Rời trang Workspace mà chưa kịp xử lý thì bỏ yêu cầu đi, đừng để dành. */
  clearRequest(): void {
    this.pendingRequest.set(null);
  }
}
