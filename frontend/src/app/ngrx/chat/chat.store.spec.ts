import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { RealtimeService } from '../../services/realtime.service';
import { ApiCreatedMessage } from '../../models';
import { ChatStore } from './chat.store';

function createdRow(over: Partial<ApiCreatedMessage> = {}): ApiCreatedMessage {
  return { id: 'm-1', orgId: 'org-1', boardId: 'b-1', userId: 'u-1', content: 'hello', createdAt: '2026-01-01T00:00:00Z', ...over };
}

describe('ChatStore', () => {
  let api: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = { get: vi.fn(), post: vi.fn() };
    try {
      localStorage.clear();
    } catch {
      /* jsdom môi trường test có thể chưa có localStorage */
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { currentUserId: () => 'u-1' } },
        { provide: RealtimeService, useValue: { lastEvent: () => null } },
      ],
    });
  });

  it('sendMessage: gửi thành công thì tin hiện trong messages() của đúng board đang mở', async () => {
    api.post.mockResolvedValue(createdRow());
    const store = TestBed.inject(ChatStore);
    await store.loadMessages('b-1'); // set loadedBoardId = 'b-1'
    api.get.mockResolvedValue([]);

    await store.sendMessage('b-1', 'hello', []);

    expect(store.messages().map((m) => m.content)).toEqual(['hello']);
  });

  it('sendMessage: API hỏng thì không thêm tin và ghi lastError', async () => {
    api.get.mockResolvedValue([]);
    api.post.mockRejectedValue(new Error('network down'));
    const store = TestBed.inject(ChatStore);
    await store.loadMessages('b-1');

    await store.sendMessage('b-1', 'hello', []);

    expect(store.messages()).toEqual([]);
    expect(store.lastError()?.message).toBeTruthy();
  });

  it('applyIncoming dùng upsert — tin của chính mình về lại qua WebSocket không nhân đôi (mục 3 của tài liệu)', async () => {
    api.get.mockResolvedValue([]);
    const store = TestBed.inject(ChatStore);
    await store.loadMessages('b-1');
    const message = { id: 'm-1', orgId: 'org-1', boardId: 'b-1', userId: 'u-1', content: 'hi', createdAt: '2026-01-01T00:00:00Z' };

    store.applyIncoming(message);
    store.applyIncoming(message);

    expect(store.messages().length).toBe(1);
  });
});
