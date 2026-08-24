import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ApiService } from '../../services/api.service';
import { BoardPrefsStore } from './board-prefs.store';

describe('BoardPrefsStore', () => {
  let api: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; patch: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
  });

  it('toggleStar: gắn sao thành công thì isStarred trả true', async () => {
    api.post.mockResolvedValue({});
    const store = TestBed.inject(BoardPrefsStore);

    await store.toggleStar('b-1');

    expect(store.isStarred('b-1')).toBe(true);
    expect(api.post).toHaveBeenCalledWith('/stars/b-1', {});
  });

  it('toggleStar: API hỏng thì hoàn tác về trạng thái cũ và ghi lastError', async () => {
    api.post.mockRejectedValue(new Error('server error'));
    const store = TestBed.inject(BoardPrefsStore);

    await store.toggleStar('b-1');

    expect(store.isStarred('b-1')).toBe(false);
    expect(store.lastError()?.message).toBeTruthy();
  });
});
