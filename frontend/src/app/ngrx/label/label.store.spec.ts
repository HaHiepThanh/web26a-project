import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ApiLabel } from '../../models';
import { ApiService } from '../../services/api.service';
import { LabelStore } from './label.store';

interface ApiMock {
  get: Mock;
  post: Mock;
  delete: Mock;
}

function makeApiLabel(overrides: Partial<ApiLabel> & { id: string }): ApiLabel {
  return {
    orgId: 'org-1',
    boardId: 'board-1',
    name: 'Nhãn',
    color: '#2563eb',
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

describe('LabelStore', () => {
  let api: ApiMock;
  let store: InstanceType<typeof LabelStore>;

  beforeEach(() => {
    api = { get: vi.fn(), post: vi.fn(), delete: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: ApiService, useValue: api }],
    });
    store = TestBed.inject(LabelStore);
  });

  describe('loadLabels', () => {
    it('nạp nhãn của board (đường thành công)', async () => {
      api.get.mockResolvedValue([makeApiLabel({ id: 'l1' }), makeApiLabel({ id: 'l2' })]);
      await store.loadLabels('board-1');

      expect(api.get).toHaveBeenCalledWith('/labels?boardId=board-1');
      expect(store.labels().map((l) => l.id).sort()).toEqual(['l1', 'l2']);
    });

    it('không gọi lại API nếu board không đổi, trừ khi force=true', async () => {
      api.get.mockResolvedValue([]);
      await store.loadLabels('board-1');
      await store.loadLabels('board-1');
      expect(api.get).toHaveBeenCalledTimes(1);

      await store.loadLabels('board-1', true);
      expect(api.get).toHaveBeenCalledTimes(2);
    });

    it('API hỏng thì rỗng danh sách và báo lỗi', async () => {
      api.get.mockRejectedValue(new Error('network down'));
      await store.loadLabels('board-1');
      expect(store.labels()).toEqual([]);
      expect(store.lastError()?.message).toBe('Failed to load labels.');
    });

    it('boardId rỗng thì xoá sạch nhãn, không gọi API', async () => {
      api.get.mockResolvedValue([makeApiLabel({ id: 'l1' })]);
      await store.loadLabels('board-1');
      await store.loadLabels('');
      expect(store.labels()).toEqual([]);
    });
  });

  describe('createLabel', () => {
    it('tạo nhãn mới, upsert vào danh sách', async () => {
      api.post.mockResolvedValue(makeApiLabel({ id: 'l1', name: 'Gấp' }));
      const label = await store.createLabel('board-1', 'Gấp', '#2563eb');

      expect(api.post).toHaveBeenCalledWith('/labels', { boardId: 'board-1', name: 'Gấp', color: '#2563eb' });
      expect(label?.id).toBe('l1');
      expect(store.labels().map((l) => l.id)).toEqual(['l1']);
    });

    it('tên rỗng thì không gọi API', async () => {
      const label = await store.createLabel('board-1', '   ', '#2563eb');
      expect(label).toBeNull();
      expect(api.post).not.toHaveBeenCalled();
    });
  });

  describe('attachLabel / detachLabel — hoàn tác theo đúng 1 card', () => {
    it('attachLabel: đường thành công', async () => {
      api.post.mockResolvedValue({});
      await store.attachLabel('card-a', 'label-1');
      expect(store.cardLabelIds()['card-a']).toEqual(['label-1']);
    });

    it('attachLabel: đã gắn rồi thì không gọi lại API', async () => {
      api.post.mockResolvedValue({});
      await store.attachLabel('card-a', 'label-1');
      await store.attachLabel('card-a', 'label-1');
      expect(api.post).toHaveBeenCalledTimes(1);
    });

    it('attachLabel API hỏng: chỉ card-a hoàn tác — card-b đổi giữa chừng qua WebSocket không mất', async () => {
      const postCall = deferred<unknown>();
      api.post.mockReturnValue(postCall.promise);

      const attachPromise = store.attachLabel('card-a', 'label-1');
      store.applyRemoteAttach('card-b', 'label-2');

      postCall.reject(new Error('gắn thất bại'));
      await attachPromise;

      expect(store.cardLabelIds()['card-a']).toEqual([]); // hoàn tác đúng card-a
      expect(store.cardLabelIds()['card-b']).toEqual(['label-2']); // card-b không bị mất
      expect(store.lastError()?.message).toBe('Failed to attach label.');
    });

    it('detachLabel: đường thành công', async () => {
      api.post.mockResolvedValue({});
      api.delete.mockResolvedValue(undefined);
      await store.attachLabel('card-a', 'label-1');
      await store.detachLabel('card-a', 'label-1');
      expect(store.cardLabelIds()['card-a']).toEqual([]);
    });

    it('detachLabel API hỏng: hoàn tác đúng card-a, không đụng card-b', async () => {
      api.post.mockResolvedValue({});
      await store.attachLabel('card-a', 'label-1');

      const delCall = deferred<void>();
      api.delete.mockReturnValue(delCall.promise);

      const detachPromise = store.detachLabel('card-a', 'label-1');
      store.applyRemoteAttach('card-b', 'label-2');

      delCall.reject(new Error('gỡ thất bại'));
      await detachPromise;

      expect(store.cardLabelIds()['card-a']).toEqual(['label-1']); // hoàn tác lại
      expect(store.cardLabelIds()['card-b']).toEqual(['label-2']);
      expect(store.lastError()?.message).toBe('Failed to detach label.');
    });
  });

  describe('setCardLabels', () => {
    it('chỉ gọi API cho phần chênh lệch (thêm mới + bớt đi)', async () => {
      api.post.mockResolvedValue({});
      await store.attachLabel('card-a', 'keep');
      await store.attachLabel('card-a', 'remove-me');
      api.post.mockClear();
      api.delete.mockResolvedValue(undefined);

      await store.setCardLabels('card-a', ['keep', 'add-me']);

      expect(api.post).toHaveBeenCalledTimes(1);
      expect(api.post).toHaveBeenCalledWith('/labels/cards/card-a/add-me', {});
      expect(api.delete).toHaveBeenCalledWith('/labels/cards/card-a/remove-me');
      expect(store.cardLabelIds()['card-a'].sort()).toEqual(['add-me', 'keep']);
    });
  });

  describe('toggleCardLabel', () => {
    it('chưa có thì gắn, đã có thì gỡ', async () => {
      api.post.mockResolvedValue({});
      api.delete.mockResolvedValue(undefined);

      store.toggleCardLabel('card-a', 'label-1');
      await Promise.resolve();
      await Promise.resolve();
      expect(store.cardLabelIds()['card-a']).toEqual(['label-1']);

      store.toggleCardLabel('card-a', 'label-1');
      await Promise.resolve();
      await Promise.resolve();
      expect(store.cardLabelIds()['card-a']).toEqual([]);
    });
  });

  describe('applyRemoteLabel / applyRemoteAttach / applyRemoteDetach', () => {
    it('applyRemoteLabel: có rồi thì ghi đè, chưa có thì thêm', () => {
      store.applyRemoteLabel(makeApiLabel({ id: 'l1', name: 'Cũ' }));
      store.applyRemoteLabel(makeApiLabel({ id: 'l1', name: 'Mới' }));
      store.applyRemoteLabel(makeApiLabel({ id: 'l2', name: 'Khác' }));

      expect(store.labels().length).toBe(2);
      expect(store.entityMap()['l1'].name).toBe('Mới');
    });

    it('applyRemoteAttach/Detach: không cần card đã "mở" trước — luôn áp được', () => {
      store.applyRemoteAttach('card-x', 'label-1');
      expect(store.cardLabelIds()['card-x']).toEqual(['label-1']);
      store.applyRemoteDetach('card-x', 'label-1');
      expect(store.cardLabelIds()['card-x']).toEqual([]);
    });
  });
});
