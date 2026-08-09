import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { ActivityLog } from '../models';

/** [BONUS #6] Activity log dạng feed cho board. */
@Injectable({ providedIn: 'root' })
export class ActivityService {
  private readonly api = inject(ApiService);

  readonly logs = signal<ActivityLog[]>([]);

  // Lấy log của board (backend đã sort mới nhất trước).
  async loadLogs(boardId: string): Promise<void> {
    const logs = await this.api.get<ActivityLog[]>(`/activity?boardId=${encodeURIComponent(boardId)}`);
    this.logs.set(logs);
  }
}
