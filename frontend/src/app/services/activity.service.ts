import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { ActivityLog } from '../models';

/** [BONUS #6] Activity log dạng feed cho board. */
@Injectable({ providedIn: 'root' })
export class ActivityService {
  private readonly api = inject(ApiService); // TODO: gọi backend qua this.api (get/post/patch/delete)

  readonly logs = signal<ActivityLog[]>([]);

  // TODO: lấy log của board, sort mới nhất trước.
  async loadLogs(boardId: string): Promise<void> {}

  // TODO: ghi 1 dòng log (câu mô tả sẵn) khi có hành động quan trọng.
  async record(boardId: string, actionText: string): Promise<void> {}
}
