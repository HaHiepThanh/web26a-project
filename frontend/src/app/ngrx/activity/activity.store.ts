import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods } from '@ngrx/signals';
import { setAllEntities, upsertEntity, withEntities } from '@ngrx/signals/entities';
import { ActivityActionType, ActivityLog } from '../../models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { activityRealtimeHooks } from './activity.realtime';

let idSeq = 1;
function mockId(prefix: string): string {
  return `${prefix}-${Date.now()}-${idSeq++}`;
}

/**
 * Store đơn giản nhất phần Hoà — chỉ đọc + thêm, không update/delete. Một file
 * là đủ (< 150 dòng ở service gốc), theo đúng mục "chia theo kích thước" của
 * tài liệu.
 */
export const ActivityStore = signalStore(
  { providedIn: 'root' },
  withEntities<ActivityLog>(),
  withComputed(({ entities }) => ({
    /** Mới nhất trước — giữ đúng thứ tự hiển thị cũ của `logs()`. */
    logs: computed(() => [...entities()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
  })),
  withMethods((store, api = inject(ApiService), auth = inject(AuthService)) => {
    return {
      /** Log của board (backend đã sort mới nhất trước, ở đây không cần sort lại). */
      async loadLogs(boardId: string): Promise<void> {
        const logs = await api.get<ActivityLog[]>(`/activity?boardId=${encodeURIComponent(boardId)}`);
        patchState(store, setAllEntities(logs));
      },

      /** Áp 1 dòng nhật ký nhận từ WebSocket — chống trùng theo id qua upsert. */
      applyRemoteLog(log: ActivityLog): void {
        patchState(store, upsertEntity(log));
      },

      logsForCard(cardId: string): ActivityLog[] {
        return store
          .entities()
          .filter((l) => l.cardId === cardId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },

      /** Ghi log DEMO tại chỗ (chưa có endpoint ghi log cho hành động này ở backend)
       *  — id luôn mới nên upsert ở đây tương đương thêm mới, không đụng bẫy #addEntity. */
      record(boardId: string, cardId: string, actionText: string, actionType: ActivityActionType = 'card_updated'): void {
        const entry: ActivityLog = {
          id: mockId('log'),
          orgId: 'org-demo',
          boardId,
          cardId,
          userId: auth.currentUserId(),
          actionType,
          actionText,
          createdAt: new Date().toISOString(),
        };
        patchState(store, upsertEntity(entry));
      },
    };
  }),
  withHooks((store) => activityRealtimeHooks(store)),
);
