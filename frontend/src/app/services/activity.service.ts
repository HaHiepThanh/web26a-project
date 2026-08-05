import { Injectable, signal } from '@angular/core';
import { ActivityLog } from '../models';
import { CURRENT_USER_ID } from './board.service';

let idSeq = 1;
function mockId(prefix: string): string {
  return `${prefix}-${Date.now()}-${idSeq++}`;
}

/** [BONUS #6 / mục 11] Activity log dạng feed, lọc theo từng thẻ (cần `activity_logs.card_id`
 *  — xem migrations/0002_*.sql). Dữ liệu giả tại chỗ, ghi log ngay khi board.ts /
 *  card-detail-modal gọi record() sau mỗi hành động quan trọng. */
@Injectable({ providedIn: 'root' })
export class ActivityService {
  readonly logs = signal<ActivityLog[]>([]);

  logsForCard(cardId: string): ActivityLog[] {
    return this.logs()
      .filter((l) => l.cardId === cardId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  record(boardId: string, cardId: string, actionText: string): void {
    const entry: ActivityLog = {
      id: mockId('log'),
      tenantId: 'tenant-demo',
      boardId,
      cardId,
      userId: CURRENT_USER_ID,
      actionText,
      createdAt: new Date().toISOString(),
    };
    this.logs.update((all) => [...all, entry]);
  }
}
