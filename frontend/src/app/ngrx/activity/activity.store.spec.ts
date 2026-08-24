import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { RealtimeService } from '../../services/realtime.service';
import { ActivityLog } from '../../models';
import { ActivityStore } from './activity.store';

function log(over: Partial<ActivityLog> = {}): ActivityLog {
  return {
    id: 'log-1',
    orgId: 'org-1',
    boardId: 'b-1',
    cardId: 'c-1',
    userId: 'u-1',
    actionType: 'card_updated',
    actionText: 'did something',
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

describe('ActivityStore', () => {
  let api: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = { get: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { currentUserId: () => 'u-1' } },
        { provide: RealtimeService, useValue: { lastEvent: () => null } },
      ],
    });
  });

  it('loadLogs: nạp thành công thì logs khớp response', async () => {
    api.get.mockResolvedValue([log()]);
    const store = TestBed.inject(ActivityStore);

    await store.loadLogs('b-1');

    expect(store.logs().length).toBe(1);
    expect(api.get).toHaveBeenCalledWith('/activity?boardId=b-1');
  });

  it('loadLogs: API hỏng thì ném lỗi ra ngoài (component tự bắt, không nuốt lỗi ở đây)', async () => {
    api.get.mockRejectedValue(new Error('network down'));
    const store = TestBed.inject(ActivityStore);

    await expect(store.loadLogs('b-1')).rejects.toThrow();
  });

  it('record: ghi log demo tại chỗ thì logsForCard thấy ngay, không nhân đôi khi id trùng', () => {
    const store = TestBed.inject(ActivityStore);

    store.record('b-1', 'c-1', 'added checklist item "x"');

    expect(store.logsForCard('c-1').length).toBe(1);
  });
});
