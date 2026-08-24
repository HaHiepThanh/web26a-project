import { Injectable, inject, signal } from '@angular/core';
import { ApiHighlightGroup, ApiSavedFilter } from '../models';
import { ApiService } from './api.service';
import { describeError } from './api-error.util';

/**
 * Tuỳ chọn RIÊNG của từng người trên board: gắn sao, bộ lọc đã lưu, nhóm
 * highlight — GỌI BACKEND THẬT.
 *
 * Trước đây cả ba nằm ở localStorage (`trello_saved_filters_<boardId>`, cờ sao
 * nhét trong `trello_boards`): đổi máy hay đổi trình duyệt là mất trắng, và cùng
 * một tài khoản đăng nhập ở hai nơi thì thấy hai kết quả khác nhau.
 *
 * Backend lọc theo `user_id` nên đây vẫn là dữ liệu riêng — người khác trong
 * cùng board không thấy bộ lọc của mình.
 */
@Injectable({ providedIn: 'root' })
export class BoardPrefsService {
  private readonly api = inject(ApiService);

  /** Id các board đã gắn sao (mọi tổ chức). */
  readonly starredBoardIds = signal<ReadonlySet<string>>(new Set());
  readonly lastError = signal<{ id: number; message: string } | null>(null);
  private errorSeq = 0;

  private fail(message: string): void {
    this.errorSeq++;
    this.lastError.set({ id: this.errorSeq, message });
  }

  // ------------------------------------------------------------ gắn sao

  async loadStars(): Promise<void> {
    try {
      const ids = await this.api.get<string[]>('/stars');
      this.starredBoardIds.set(new Set(ids));
    } catch {
      // Không báo lỗi ồn ào: mất danh sách sao chỉ làm ngôi sao hiện sai, không
      // chặn người dùng làm gì cả.
      this.starredBoardIds.set(new Set());
    }
  }

  isStarred(boardId: string): boolean {
    return this.starredBoardIds().has(boardId);
  }

  /** Bật/tắt sao. Đổi trên màn hình ngay, hỏng thì trả lại. */
  async toggleStar(boardId: string): Promise<void> {
    const truoc = this.starredBoardIds();
    const dangSao = truoc.has(boardId);

    const next = new Set(truoc);
    if (dangSao) next.delete(boardId);
    else next.add(boardId);
    this.starredBoardIds.set(next);

    try {
      if (dangSao) await this.api.delete(`/stars/${boardId}`);
      else await this.api.post(`/stars/${boardId}`, {});
    } catch (e) {
      this.starredBoardIds.set(truoc);
      this.fail(describeError(e, 'Failed to save star.'));
    }
  }

  // ------------------------------------------------------- bộ lọc đã lưu

  async loadFilters(boardId: string): Promise<ApiSavedFilter[]> {
    try {
      return await this.api.get<ApiSavedFilter[]>(
        `/saved-filters?boardId=${encodeURIComponent(boardId)}`,
      );
    } catch (e) {
      this.fail(describeError(e, 'Failed to load saved filters.'));
      return [];
    }
  }

  async createFilter(input: {
    boardId: string;
    name: string;
    assigneeIds: string[];
    labelIds: string[];
    priorities: string[];
    dateFilter: string | null;
  }): Promise<ApiSavedFilter | null> {
    try {
      return await this.api.post<ApiSavedFilter>('/saved-filters', input);
    } catch (e) {
      this.fail(describeError(e, 'Failed to save filter.'));
      return null;
    }
  }

  async removeFilter(id: string): Promise<boolean> {
    try {
      await this.api.delete(`/saved-filters/${id}`);
      return true;
    } catch (e) {
      this.fail(describeError(e, 'Failed to delete filter.'));
      return false;
    }
  }

  // ---------------------------------------------------- nhóm highlight

  async loadGroups(boardId: string): Promise<ApiHighlightGroup[]> {
    try {
      return await this.api.get<ApiHighlightGroup[]>(
        `/highlight-groups?boardId=${encodeURIComponent(boardId)}`,
      );
    } catch (e) {
      this.fail(describeError(e, 'Failed to load highlight groups.'));
      return [];
    }
  }

  async createGroup(input: {
    boardId: string;
    name: string;
    cardIds: string[];
  }): Promise<ApiHighlightGroup | null> {
    try {
      return await this.api.post<ApiHighlightGroup>('/highlight-groups', input);
    } catch (e) {
      this.fail(describeError(e, 'Failed to save highlight group.'));
      return null;
    }
  }

  async removeGroup(id: string): Promise<boolean> {
    try {
      await this.api.delete(`/highlight-groups/${id}`);
      return true;
    } catch (e) {
      this.fail(describeError(e, 'Failed to delete highlight group.'));
      return false;
    }
  }
}
