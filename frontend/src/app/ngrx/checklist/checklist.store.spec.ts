import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ApiChecklistItem } from '../../models';
import { ApiService } from '../../services/api.service';
import { ChecklistStore } from './checklist.store';

interface ApiMock {
  get: Mock;
  post: Mock;
  patch: Mock;
  delete: Mock;
}

function makeApiItem(overrides: Partial<ApiChecklistItem> & { id: string; cardId: string }): ApiChecklistItem {
  return {
    content: 'Việc cần làm',
    isDone: false,
    position: 0,
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

describe('ChecklistStore', () => {
  let api: ApiMock;
  let store: InstanceType<typeof ChecklistStore>;

  beforeEach(() => {
    api = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: ApiService, useValue: api }],
    });
    store = TestBed.inject(ChecklistStore);
  });

  describe('loadChecklist', () => {
    it('nạp checklist, gom theo card và sắp theo position (đường thành công)', async () => {
      api.get.mockResolvedValue([
        makeApiItem({ id: 'i2', cardId: 'c1', position: 2 }),
        makeApiItem({ id: 'i1', cardId: 'c1', position: 1 }),
      ]);

      await store.loadChecklist('c1');

      expect(api.get).toHaveBeenCalledWith('/checklist?cardId=c1');
      expect(store.itemsFor('c1').map((i) => i.id)).toEqual(['i1', 'i2']);
    });

    it('không gọi lại API nếu card đã nạp rồi, trừ khi force=true', async () => {
      api.get.mockResolvedValue([]);
      await store.loadChecklist('c1');
      await store.loadChecklist('c1');
      expect(api.get).toHaveBeenCalledTimes(1);

      await store.loadChecklist('c1', true);
      expect(api.get).toHaveBeenCalledTimes(2);
    });

    it('API hỏng: cho phép nạp lại lần sau (bỏ khỏi loadedCardIds) và báo lỗi', async () => {
      api.get.mockRejectedValueOnce(new Error('network down'));
      await store.loadChecklist('c1');
      expect(store.lastError()?.message).toBe('Failed to load checklist.');

      api.get.mockResolvedValueOnce([makeApiItem({ id: 'i1', cardId: 'c1' })]);
      await store.loadChecklist('c1');
      expect(api.get).toHaveBeenCalledTimes(2);
      expect(store.itemsFor('c1').length).toBe(1);
    });

    it('nạp lại chỉ thay đúng phần của card này, không đụng checklist card khác đang mở', async () => {
      api.get.mockResolvedValueOnce([makeApiItem({ id: 'i1', cardId: 'c1' })]);
      await store.loadChecklist('c1');
      api.get.mockResolvedValueOnce([makeApiItem({ id: 'j1', cardId: 'c2' })]);
      await store.loadChecklist('c2');

      expect(store.itemsFor('c1').map((i) => i.id)).toEqual(['i1']);
      expect(store.itemsFor('c2').map((i) => i.id)).toEqual(['j1']);
    });
  });

  describe('addItem', () => {
    it('thêm mục mới, upsert vào đúng card', async () => {
      api.get.mockResolvedValue([]);
      await store.loadChecklist('c1');
      api.post.mockResolvedValue(makeApiItem({ id: 'i1', cardId: 'c1', content: 'Mục mới' }));

      await store.addItem('c1', 'Mục mới');

      expect(api.post).toHaveBeenCalledWith('/checklist', { cardId: 'c1', content: 'Mục mới' });
      expect(store.itemsFor('c1').map((i) => i.content)).toEqual(['Mục mới']);
    });

    it('nội dung rỗng thì không gọi API', async () => {
      await store.addItem('c1', '   ');
      expect(api.post).not.toHaveBeenCalled();
    });
  });

  describe('toggleItem — hoàn tác theo entity', () => {
    beforeEach(async () => {
      api.get.mockResolvedValue([
        makeApiItem({ id: 'a', cardId: 'c1', content: 'A', isDone: false, position: 0 }),
        makeApiItem({ id: 'b', cardId: 'c1', content: 'B', isDone: false, position: 1 }),
      ]);
      await store.loadChecklist('c1');
    });

    it('đường thành công: tick đúng mục, không đụng mục khác', async () => {
      api.patch.mockResolvedValue(makeApiItem({ id: 'a', cardId: 'c1', isDone: true }));
      await store.toggleItem('c1', 'a');
      expect(store.entityMap()['a'].isDone).toBe(true);
      expect(store.entityMap()['b'].isDone).toBe(false);
    });

    it('API hỏng: chỉ mục A hoàn tác — sự kiện WebSocket của mục B đến giữa chừng không bị xoá', async () => {
      const patchCall = deferred<ApiChecklistItem>();
      api.patch.mockReturnValue(patchCall.promise);

      const togglePromise = store.toggleItem('c1', 'a');
      store.applyRemoteItem(makeApiItem({ id: 'b', cardId: 'c1', content: 'B đổi bởi người khác', isDone: true }));

      patchCall.reject(new Error('lưu thất bại'));
      await togglePromise;

      expect(store.entityMap()['a'].isDone).toBe(false); // hoàn tác đúng A
      expect(store.entityMap()['b'].content).toBe('B đổi bởi người khác'); // B không mất
      expect(store.lastError()?.message).toBe('Failed to save checklist item.');
    });
  });

  describe('renameItem — hoàn tác theo entity', () => {
    beforeEach(async () => {
      api.get.mockResolvedValue([makeApiItem({ id: 'a', cardId: 'c1', content: 'Cũ' })]);
      await store.loadChecklist('c1');
    });

    it('đường thành công', async () => {
      api.patch.mockResolvedValue(makeApiItem({ id: 'a', cardId: 'c1', content: 'Mới' }));
      await store.renameItem('c1', 'a', 'Mới');
      expect(store.entityMap()['a'].content).toBe('Mới');
    });

    it('API hỏng: hoàn tác đúng nội dung cũ', async () => {
      api.patch.mockRejectedValue(new Error('fail'));
      await store.renameItem('c1', 'a', 'Mới');
      expect(store.entityMap()['a'].content).toBe('Cũ');
      expect(store.lastError()?.message).toBe('Failed to rename checklist item.');
    });
  });

  describe('deleteItem', () => {
    beforeEach(async () => {
      api.get.mockResolvedValue([
        makeApiItem({ id: 'a', cardId: 'c1' }),
        makeApiItem({ id: 'b', cardId: 'c1' }),
      ]);
      await store.loadChecklist('c1');
    });

    it('đường thành công: xoá đúng mục', async () => {
      api.delete.mockResolvedValue(undefined);
      await store.deleteItem('c1', 'a');
      expect(store.entityMap()['a']).toBeUndefined();
      expect(store.entityMap()['b']).toBeTruthy();
    });

    it('API hỏng: khôi phục đúng mục vừa xoá, không đụng mục khác', async () => {
      const delCall = deferred<void>();
      api.delete.mockReturnValue(delCall.promise);

      const deletePromise = store.deleteItem('c1', 'a');
      store.applyRemoteItem(makeApiItem({ id: 'b', cardId: 'c1', content: 'B đổi bởi người khác' }));

      delCall.reject(new Error('xoá thất bại'));
      await deletePromise;

      expect(store.entityMap()['a']).toBeTruthy();
      expect(store.entityMap()['b'].content).toBe('B đổi bởi người khác');
    });
  });

  describe('applyRemoteItem / applyRemoteDeleted / clearCard', () => {
    it('bỏ qua sự kiện remote nếu card chưa từng loadChecklist', () => {
      store.applyRemoteItem(makeApiItem({ id: 'a', cardId: 'c-chua-mo' }));
      expect(store.entities().length).toBe(0);
    });

    it('applyRemoteItem: upsert đúng vào card đã mở', async () => {
      api.get.mockResolvedValue([]);
      await store.loadChecklist('c1');
      store.applyRemoteItem(makeApiItem({ id: 'a', cardId: 'c1' }));
      expect(store.itemsFor('c1').map((i) => i.id)).toEqual(['a']);
    });

    it('applyRemoteDeleted: gỡ đúng 1 mục khỏi card đã mở', async () => {
      api.get.mockResolvedValue([
        makeApiItem({ id: 'a', cardId: 'c1' }),
        makeApiItem({ id: 'b', cardId: 'c1' }),
      ]);
      await store.loadChecklist('c1');
      store.applyRemoteDeleted('c1', 'a');
      expect(store.entityMap()['a']).toBeUndefined();
      expect(store.entityMap()['b']).toBeTruthy();
    });

    it('clearCard: xoá mọi mục của 1 card, giữ nguyên card khác, cho phép loadChecklist lại', async () => {
      api.get.mockResolvedValueOnce([makeApiItem({ id: 'a', cardId: 'c1' })]);
      await store.loadChecklist('c1');
      api.get.mockResolvedValueOnce([makeApiItem({ id: 'x', cardId: 'c2' })]);
      await store.loadChecklist('c2');

      store.clearCard('c1');

      expect(store.itemsFor('c1')).toEqual([]);
      expect(store.itemsFor('c2').map((i) => i.id)).toEqual(['x']);

      // Đã gỡ khỏi loadedCardIds nên gọi lại loadChecklist('c1') phải gọi API lần nữa.
      api.get.mockResolvedValueOnce([makeApiItem({ id: 'a2', cardId: 'c1' })]);
      await store.loadChecklist('c1');
      expect(api.get).toHaveBeenCalledTimes(3);
    });
  });

  describe('progressByCard', () => {
    it('tính đúng done/total theo từng card, bỏ qua card rỗng', async () => {
      api.get.mockResolvedValueOnce([
        makeApiItem({ id: 'a', cardId: 'c1', isDone: true }),
        makeApiItem({ id: 'b', cardId: 'c1', isDone: false }),
      ]);
      await store.loadChecklist('c1');

      expect(store.progressByCard()['c1']).toEqual({ done: 1, total: 2 });
      expect(store.progressByCard()['c-khong-ton-tai']).toBeUndefined();
    });
  });
});
