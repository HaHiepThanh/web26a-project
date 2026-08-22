import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { ActivityActionType, ActivityLog } from '../models';
import { AuthService } from './auth.service';

let idSeq = 1;
function mockId(prefix: string): string {
  return `${prefix}-${Date.now()}-${idSeq++}`;
}

/** [BONUS #6 / mục 11] Activity log dạng feed, lọc theo từng thẻ (cần `activity_logs.card_id`
 *  — xem migrations/0002_*.sql). `loadLogs()` nạp từ backend thật; `record()` ghi log giả
 *  tại chỗ ngay khi board.ts / card-detail-modal gọi sau mỗi hành động quan trọng (demo). */
@Injectable({ providedIn: 'root' })
export class ActivityService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly logs = signal<ActivityLog[]>([]);

  // Lấy log của board (backend đã sort mới nhất trước).
  async loadLogs(boardId: string): Promise<void> {
    const logs = await this.api.get<ActivityLog[]>(`/activity?boardId=${encodeURIComponent(boardId)}`);
    this.logs.set(logs);
  }

  /** Áp 1 dòng nhật ký nhận từ WebSocket — mới nhất lên đầu, chống trùng theo id. */
  applyRemoteLog(log: ActivityLog): void {
    this.logs.update((all) => (all.some((l) => l.id === log.id) ? all : [log, ...all]));
  }

  logsForCard(cardId: string): ActivityLog[] {
    return this.logs()
      .filter((l) => l.cardId === cardId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  record(boardId: string, cardId: string, actionText: string, actionType: ActivityActionType = 'card_updated'): void {
    const entry: ActivityLog = {
      id: mockId('log'),
      orgId: 'org-demo',
      boardId,
      cardId,
      userId: this.auth.currentUserId(),
      actionType,
      actionText,
      createdAt: new Date().toISOString(),
    };
    this.logs.update((all) => [...all, entry]);
  }
}
