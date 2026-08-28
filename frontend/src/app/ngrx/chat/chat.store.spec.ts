import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { RealtimeService } from '../../services/realtime.service';
import { ApiMessage } from '../../models';
import { ChatStore } from './chat.store';

function row(over: Partial<ApiMessage> = {}): ApiMessage {
  return {
    id: 'm-1',
    orgId: 'org-1',
    boardId: 'b-1',
    userId: 'u-1',
    content: 'hello',
    createdAt: '2026-01-01T00:00:00Z',
    editedAt: null,
    deletedAt: null,
    replyToId: null,
    replyTo: null,
    user: null,
    ...over,
  };
}

const trang = (messages: ApiMessage[], hasMore = false) => ({ messages, hasMore });

describe('ChatStore', () => {
  let api: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
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

  async function moBoard(rows: ApiMessage[] = [], hasMore = false) {
    api.get.mockResolvedValue(trang(rows, hasMore));
    const store = TestBed.inject(ChatStore);
    await store.loadMessages('b-1');
    return store;
  }

  it('sendMessage: gửi thành công thì tin hiện trong messages() của đúng board đang mở', async () => {
    const store = await moBoard();
    api.post.mockResolvedValue(row());

    await store.sendMessage('b-1', 'hello', []);

    expect(store.messages().map((m) => m.content)).toEqual(['hello']);
  });

  it('sendMessage: API hỏng thì không thêm tin và ghi lastError', async () => {
    const store = await moBoard();
    api.post.mockRejectedValue(new Error('network down'));

    await store.sendMessage('b-1', 'hello', []);

    expect(store.messages()).toEqual([]);
    expect(store.lastError()?.message).toBeTruthy();
  });

  it('applyIncoming dùng upsert — tin của chính mình về lại qua WebSocket không nhân đôi (mục 3 của tài liệu)', async () => {
    const store = await moBoard();
    const message = {
      id: 'm-1', orgId: 'org-1', boardId: 'b-1', userId: 'u-1',
      content: 'hi', createdAt: '2026-01-01T00:00:00Z',
    };

    store.applyIncoming(message);
    store.applyIncoming(message);

    expect(store.messages().length).toBe(1);
  });

  describe('phân trang', () => {
    it('trang đầu xin đúng 10 tin và nhớ hasMore', async () => {
      const store = await moBoard([row()], true);
      expect(api.get.mock.calls[0][0]).toContain('limit=10');
      expect(store.hasMore()['b-1']).toBe(true);
    });

    it('loadOlder neo con trỏ vào tin CŨ NHẤT đang giữ', async () => {
      const store = await moBoard(
        [
          row({ id: 'm-2', createdAt: '2026-01-02T00:00:00Z' }),
          row({ id: 'm-1', createdAt: '2026-01-01T00:00:00Z' }),
        ],
        true,
      );
      api.get.mockResolvedValue(trang([row({ id: 'm-0', createdAt: '2025-12-31T00:00:00Z' })], false));

      await store.loadOlder('b-1');

      const url = api.get.mock.calls[1][0] as string;
      expect(url).toContain(encodeURIComponent('2026-01-01T00:00:00Z_m-1'));
      expect(store.messages().map((m) => m.id)).toEqual(['m-0', 'm-1', 'm-2']);
    });

    it('hết trang thì KHÔNG gọi API nữa', async () => {
      const store = await moBoard([row()], false);
      const truoc = api.get.mock.calls.length;

      expect(await store.loadOlder('b-1')).toBe(false);
      expect(api.get.mock.calls.length).toBe(truoc);
    });

    it('hai lượt gọi CHỒNG NHAU chỉ bắn đúng một request', async () => {
      // Mỗi trang 10 tin thường chưa lấp đầy màn hình nên mốc canh bắn liên
      // tiếp. Không có cờ chặn thì nhiều request cùng bay đi với CÙNG một con
      // trỏ và tin bị nhân bản.
      const store = await moBoard([row()], true);
      let moKhoa!: (v: unknown) => void;
      api.get.mockReturnValue(new Promise((r) => (moKhoa = r)));

      const a = store.loadOlder('b-1');
      const b = store.loadOlder('b-1');
      moKhoa(trang([], false));
      await Promise.all([a, b]);

      expect(api.get.mock.calls.length).toBe(2); // 1 lần loadMessages + 1 lần loadOlder
    });

    it('phần xem trước Dashboard xin 30 tin, không phải 10', async () => {
      // Badge "chưa đọc" đếm trong PREVIEW_KEEP tin gần nhất; lấy trang mặc
      // định 10 thì badge chặn ở 10 dù có 25 tin chưa đọc.
      api.get.mockResolvedValue(trang([]));
      const store = TestBed.inject(ChatStore);
      await store.loadPreviews(['b-9']);
      expect(api.get.mock.calls[0][0]).toContain('limit=30');
    });
  });

  describe('trả lời / sửa / thu hồi', () => {
    it('sendMessage kèm replyToId thì gửi kèm lên server', async () => {
      const store = await moBoard();
      api.post.mockResolvedValue(row({ replyToId: 'm-0' }));

      await store.sendMessage('b-1', 'trả lời nè', [], 'm-0');

      expect(api.post.mock.calls[0][1]).toMatchObject({ replyToId: 'm-0' });
    });

    it('không trả lời ai thì KHÔNG gửi replyToId rỗng', async () => {
      const store = await moBoard();
      api.post.mockResolvedValue(row());

      await store.sendMessage('b-1', 'bình thường', []);

      expect(api.post.mock.calls[0][1]).not.toHaveProperty('replyToId');
    });

    it('editMessage cập nhật nội dung và đánh dấu editedAt', async () => {
      const store = await moBoard([row()]);
      api.patch.mockResolvedValue(row({ content: 'đã sửa', editedAt: '2026-01-02T00:00:00Z' }));

      await store.editMessage('m-1', 'đã sửa');

      expect(store.messages()[0].content).toBe('đã sửa');
      expect(store.messages()[0].editedAt).toBeTruthy();
    });

    it('recallMessage xoá nội dung và đánh dấu deletedAt', async () => {
      const store = await moBoard([row()]);
      api.delete.mockResolvedValue(row({ content: '', deletedAt: '2026-01-02T00:00:00Z' }));

      await store.recallMessage('m-1');

      expect(store.messages()[0].content).toBe('');
      expect(store.messages()[0].deletedAt).toBeTruthy();
    });

    it('SỬA tin gốc thì Ô TRÍCH DẪN trong câu trả lời cũng đổi theo', async () => {
      // Ô trích dẫn là bản chụp nội dung tại lúc tải trang. Chỉ vá mỗi tin gốc
      // thì câu trả lời vẫn trưng nguyên văn cũ cho tới khi F5.
      const store = await moBoard([
        row({ id: 'm-1', content: 'bản gốc' }),
        row({
          id: 'm-2',
          content: 'ok',
          createdAt: '2026-01-02T00:00:00Z',
          replyToId: 'm-1',
          replyTo: { id: 'm-1', userId: 'u-1', content: 'bản gốc', deletedAt: null, user: null },
        }),
      ]);
      api.patch.mockResolvedValue(row({ id: 'm-1', content: 'bản mới', editedAt: '2026-01-03T00:00:00Z' }));

      await store.editMessage('m-1', 'bản mới');

      const traLoi = store.messages().find((m) => m.id === 'm-2')!;
      expect(traLoi.replyTo?.content).toBe('bản mới');
    });

    it('THU HỒI tin gốc thì ô trích dẫn cũng thành đã-thu-hồi', async () => {
      const store = await moBoard([
        row({ id: 'm-1', content: 'bản gốc' }),
        row({
          id: 'm-2',
          content: 'ok',
          createdAt: '2026-01-02T00:00:00Z',
          replyToId: 'm-1',
          replyTo: { id: 'm-1', userId: 'u-1', content: 'bản gốc', deletedAt: null, user: null },
        }),
      ]);
      api.delete.mockResolvedValue(row({ id: 'm-1', content: '', deletedAt: '2026-01-03T00:00:00Z' }));

      await store.recallMessage('m-1');

      const traLoi = store.messages().find((m) => m.id === 'm-2')!;
      expect(traLoi.replyTo?.deletedAt).toBeTruthy();
      expect(traLoi.replyTo?.content).toBe('');
    });
  });
});
