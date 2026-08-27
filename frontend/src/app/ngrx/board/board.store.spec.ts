import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { ApiService } from '../../services/api.service';
import { RealtimeService } from '../../services/realtime.service';
import { OrganizationStore } from '../organization/organization.store';
import { ApiBoard } from '../../models';
import { BoardStore } from './board.store';

function apiBoardRow(over: Partial<ApiBoard> = {}): ApiBoard {
  return {
    id: 'b-1',
    orgId: 'org-1',
    workspaceId: 'w-1',
    name: 'Board Seed',
    visibility: 'workspace',
    background: null,
    createdBy: 'u-1',
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  } as ApiBoard;
}

describe('BoardStore', () => {
  let api: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; patch: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: RealtimeService, useValue: { lastEvent: () => null } },
        { provide: OrganizationStore, useValue: { membersOf: () => [], activeOrgId: signal(null) } },
      ],
    });
    try {
      localStorage.clear();
    } catch {
      /* jsdom môi trường test có thể chưa có localStorage */
    }
  });

  it('loadBoard: nạp thành công thì currentBoard khớp response', async () => {
    api.get.mockResolvedValue(apiBoardRow());
    const store = TestBed.inject(BoardStore);

    await store.loadBoard('b-1');

    expect(store.currentBoard()?.id).toBe('b-1');
    expect(store.currentBoard()?.name).toBe('Board Seed');
  });

  it('loadBoard: API hỏng (404) thì currentBoard về null và ghi loadError', async () => {
    api.get.mockRejectedValue(new Error('not found'));
    const store = TestBed.inject(BoardStore);

    await store.loadBoard('b-1');

    expect(store.currentBoard()).toBeNull();
    expect(store.loadError()).toBeTruthy();
    expect(store.loading()).toBe(false);
  });

  it('loadBoard: trong lúc đang nạp thì loading = true và currentBoard = null (chống dính dữ liệu cũ)', async () => {
    let resolver: (v: ApiBoard) => void;
    const pendingPromise = new Promise<ApiBoard>((res) => {
      resolver = res;
    });
    api.get.mockReturnValue(pendingPromise);
    const store = TestBed.inject(BoardStore);

    const loadPromise = store.loadBoard('b-2');

    expect(store.loading()).toBe(true);
    expect(store.currentBoard()).toBeNull();

    resolver!(apiBoardRow({ id: 'b-2', name: 'Board B' }));
    await loadPromise;

    expect(store.loading()).toBe(false);
    expect(store.currentBoard()?.id).toBe('b-2');
  });
});
