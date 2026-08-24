import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ApiService } from '../../services/api.service';
import { RealtimeService } from '../../services/realtime.service';
import { ApiList } from '../../models';
import { ListStore } from './list.store';

function apiListRow(over: Partial<ApiList> = {}): ApiList {
  return { id: 'l-1', orgId: 'org-1', boardId: 'b-1', name: 'To Do', position: 1, createdAt: '2026-01-01T00:00:00Z', ...over };
}

describe('ListStore', () => {
  let api: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; patch: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: RealtimeService, useValue: { lastEvent: () => null } },
      ],
    });
  });

  it('loadLists: nạp thành công thì entities khớp response, sort theo position', async () => {
    api.get.mockResolvedValue([apiListRow({ id: 'l-2', position: 2 }), apiListRow({ id: 'l-1', position: 1 })]);
    const store = TestBed.inject(ListStore);

    await store.loadLists('b-1');

    expect(store.lists().map((l) => l.id)).toEqual(['l-1', 'l-2']);
    expect(api.get).toHaveBeenCalledWith('/lists?boardId=b-1');
  });

  it('loadLists: API hỏng thì rỗng danh sách và ghi lastError', async () => {
    api.get.mockRejectedValue(new Error('network down'));
    const store = TestBed.inject(ListStore);

    await store.loadLists('b-1');

    expect(store.lists()).toEqual([]);
    expect(store.lastError()?.message).toBeTruthy();
  });

  it('applyRemote (WebSocket) dùng upsert — gọi lại với cùng id không nhân đôi (mục 3 của tài liệu)', () => {
    const store = TestBed.inject(ListStore);
    const row = apiListRow();

    store.applyRemote(row);
    store.applyRemote(row);

    expect(store.lists().length).toBe(1);
  });
});
