import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ApiService } from '../../services/api.service';
import { RealtimeService } from '../../services/realtime.service';
import { ChatTaskSuggestion } from '../../models';
import { TaskSuggestionStore } from './task-suggestion.store';

function suggestion(over: Partial<ChatTaskSuggestion> = {}): ChatTaskSuggestion {
  return {
    id: 's-1',
    orgId: 'org-1',
    boardId: 'b-1',
    messageId: 'm-1',
    createdBy: 'u-1',
    status: 'pending',
    cards: [{ title: 'New card' }],
    model: 'gemini',
    createdAt: '2026-01-01T00:00:00Z',
    resolvedAt: null,
    resolvedBy: null,
    ...over,
  };
}

describe('TaskSuggestionStore', () => {
  let api: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = { get: vi.fn(), post: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: RealtimeService, useValue: { lastEvent: () => null } },
      ],
    });
  });

  it('loadSuggestions: nạp thành công thì suggestionsFor(boardId) khớp response', async () => {
    api.get.mockResolvedValue([suggestion()]);
    const store = TestBed.inject(TaskSuggestionStore);

    await store.loadSuggestions('b-1');

    expect(store.suggestionsFor('b-1').length).toBe(1);
  });

  it('accept: API hỏng thì vẫn gỡ gợi ý khỏi màn hình (đã bị người khác xử lý) và trả về câu lỗi', async () => {
    api.post.mockRejectedValue(new Error('409 conflict'));
    const store = TestBed.inject(TaskSuggestionStore);
    store.applyRemoteCreated(suggestion());

    const error = await store.accept(suggestion(), [{ title: 'New card' }]);

    expect(error).toBeTruthy();
    expect(store.suggestionsFor('b-1').length).toBe(0);
  });

  it('applyRemoteResolved: đóng modal nếu đúng gợi ý đang mở (mục 5 của tài liệu)', () => {
    const store = TestBed.inject(TaskSuggestionStore);
    store.applyRemoteCreated(suggestion());
    store.open(suggestion());

    store.applyRemoteResolved('s-1');

    expect(store.opened()).toBeNull();
  });
});
