import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ApiComment, ApiCreatedComment } from '../../models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { CommentStore } from './comment.store';

interface ApiMock {
  get: Mock;
  post: Mock;
  delete: Mock;
}

function makeApiComment(overrides: Partial<ApiComment> & { id: string }): ApiComment {
  return {
    userId: 'user-1',
    content: 'Bình luận',
    createdAt: '2026-01-01T00:00:00.000Z',
    user: { displayName: 'Ai đó', avatarUrl: null },
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('CommentStore', () => {
  let api: ApiMock;
  let store: InstanceType<typeof CommentStore>;

  beforeEach(() => {
    api = { get: vi.fn(), post: vi.fn(), delete: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { currentUser: () => ({ id: 'user-1', email: 'me@test.dev' }) } },
      ],
    });
    store = TestBed.inject(CommentStore);
  });

  describe('loadComments', () => {
    it('nạp bình luận, gom theo card, sắp theo thời gian tạo', async () => {
      api.get.mockResolvedValue([
        makeApiComment({ id: 'c2', createdAt: '2026-01-02T00:00:00.000Z' }),
        makeApiComment({ id: 'c1', createdAt: '2026-01-01T00:00:00.000Z' }),
      ]);

      await store.loadComments('card-1');

      expect(api.get).toHaveBeenCalledWith('/comments?cardId=card-1');
      expect(store.commentsFor('card-1').map((c) => c.id)).toEqual(['c1', 'c2']);
    });

    it('luôn nạp mới mỗi lần gọi — không cache như CardStore/ChecklistStore', async () => {
      api.get.mockResolvedValue([]);
      await store.loadComments('card-1');
      await store.loadComments('card-1');
      expect(api.get).toHaveBeenCalledTimes(2);
    });

    it('API hỏng thì báo lỗi', async () => {
      api.get.mockRejectedValue(new Error('network down'));
      await store.loadComments('card-1');
      expect(store.lastError()?.message).toBe('Failed to load comments.');
    });

    it('gọi lại chỉ thay đúng phần của card này, không đụng card khác đang mở', async () => {
      api.get.mockResolvedValueOnce([makeApiComment({ id: 'a' })]);
      await store.loadComments('c1');
      api.get.mockResolvedValueOnce([makeApiComment({ id: 'b' })]);
      await store.loadComments('c2');

      expect(store.commentsFor('c1').map((c) => c.id)).toEqual(['a']);
      expect(store.commentsFor('c2').map((c) => c.id)).toEqual(['b']);
    });

    it('map đúng user từ khối join (displayName/avatarUrl), email rỗng', async () => {
      api.get.mockResolvedValue([makeApiComment({ id: 'a', user: { displayName: 'Bạn A', avatarUrl: 'x.png' } })]);
      await store.loadComments('c1');
      expect(store.commentsFor('c1')[0].user).toEqual({ id: 'user-1', email: '', displayName: 'Bạn A', avatarUrl: 'x.png' });
    });
  });

  describe('addComment', () => {
    it('gửi bình luận, upsert kèm thông tin người dùng hiện tại', async () => {
      const created: ApiCreatedComment = { id: 'new-1', cardId: 'c1', userId: 'user-1', content: 'Xin chào', createdAt: '2026-01-03T00:00:00.000Z' };
      api.post.mockResolvedValue(created);

      await store.addComment('c1', 'Xin chào');

      expect(api.post).toHaveBeenCalledWith('/comments', { cardId: 'c1', content: 'Xin chào' });
      const list = store.commentsFor('c1');
      expect(list.map((c) => c.id)).toEqual(['new-1']);
      expect(list[0].user?.id).toBe('user-1');
    });

    it('nội dung rỗng thì không gọi API', async () => {
      await store.addComment('c1', '   ');
      expect(api.post).not.toHaveBeenCalled();
    });

    it('API hỏng thì báo lỗi, không thêm bình luận', async () => {
      api.post.mockRejectedValue(new Error('fail'));
      await store.addComment('c1', 'Xin chào');
      expect(store.commentsFor('c1')).toEqual([]);
      expect(store.lastError()?.message).toBe('Failed to send comment.');
    });
  });

  describe('deleteComment — hoàn tác theo entity', () => {
    beforeEach(async () => {
      api.get.mockResolvedValue([makeApiComment({ id: 'a' }), makeApiComment({ id: 'b' })]);
      await store.loadComments('c1');
    });

    it('đường thành công: xoá đúng bình luận', async () => {
      api.delete.mockResolvedValue(undefined);
      await store.deleteComment('c1', 'a');
      expect(store.entityMap()['a']).toBeUndefined();
      expect(store.entityMap()['b']).toBeTruthy();
    });

    it('API hỏng: khôi phục đúng bình luận vừa xoá — sự kiện WS của bình luận khác đến giữa chừng không bị mất', async () => {
      const delCall = deferred<void>();
      api.delete.mockReturnValue(delCall.promise);

      const deletePromise = store.deleteComment('c1', 'a');
      store.applyRemoteComment({ id: 'new-remote', cardId: 'c1', userId: 'user-2', content: 'Vừa vào', createdAt: '2026-01-04T00:00:00.000Z' });

      delCall.reject(new Error('xoá thất bại'));
      await deletePromise;

      expect(store.entityMap()['a']).toBeTruthy();
      expect(store.entityMap()['new-remote']).toBeTruthy();
      expect(store.lastError()?.message).toBe('Failed to delete comment.');
    });
  });

  describe('applyRemoteComment / applyRemoteCommentDeleted / clearCard', () => {
    it('bỏ qua sự kiện remote nếu card chưa từng loadComments', () => {
      store.applyRemoteComment({ id: 'a', cardId: 'c-chua-mo', userId: 'u', content: 'x', createdAt: '2026-01-01T00:00:00.000Z' });
      expect(store.entities().length).toBe(0);
    });

    it('applyRemoteComment: upsert đúng vào card đã mở', async () => {
      api.get.mockResolvedValue([]);
      await store.loadComments('c1');
      store.applyRemoteComment({ id: 'a', cardId: 'c1', userId: 'u', content: 'x', createdAt: '2026-01-01T00:00:00.000Z' });
      expect(store.commentsFor('c1').map((c) => c.id)).toEqual(['a']);
    });

    it('applyRemoteCommentDeleted: gỡ đúng 1 bình luận khỏi card đã mở', async () => {
      api.get.mockResolvedValue([makeApiComment({ id: 'a' }), makeApiComment({ id: 'b' })]);
      await store.loadComments('c1');
      store.applyRemoteCommentDeleted('c1', 'a');
      expect(store.entityMap()['a']).toBeUndefined();
      expect(store.entityMap()['b']).toBeTruthy();
    });

    it('clearCard: xoá mọi bình luận của 1 card, giữ nguyên card khác', async () => {
      api.get.mockResolvedValueOnce([makeApiComment({ id: 'a' })]);
      await store.loadComments('c1');
      api.get.mockResolvedValueOnce([makeApiComment({ id: 'x' })]);
      await store.loadComments('c2');

      store.clearCard('c1');

      expect(store.commentsFor('c1')).toEqual([]);
      expect(store.commentsFor('c2').map((c) => c.id)).toEqual(['x']);
    });
  });

  describe('countByCard', () => {
    it('đếm đúng số bình luận theo từng card, bỏ qua card rỗng', async () => {
      api.get.mockResolvedValueOnce([makeApiComment({ id: 'a' }), makeApiComment({ id: 'b' })]);
      await store.loadComments('c1');
      expect(store.countByCard()['c1']).toBe(2);
      expect(store.countByCard()['c-khong-ton-tai']).toBeUndefined();
    });
  });
});
