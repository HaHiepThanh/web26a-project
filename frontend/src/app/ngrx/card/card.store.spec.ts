import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ApiCard, CardPriority } from '../../models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { CardStore } from './card.store';

/** Chỉ giả các phương thức `card.methods.ts` thực sự gọi tới. */
interface ApiMock {
  get: Mock;
  post: Mock;
  patch: Mock;
  delete: Mock;
}

function makeApiCard(overrides: Partial<ApiCard> & { id: string; listId: string }): ApiCard {
  return {
    orgId: 'org-1',
    title: 'Thẻ',
    description: null,
    assigneeId: null,
    dueDate: null,
    priority: 'medium' as CardPriority,
    completedAt: null,
    position: 0,
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Promise tự điều khiển lúc resolve/reject — dùng để chèn 1 sự kiện WebSocket
 *  "đến giữa chừng" trong lúc `updateCard`/`moveCardOptimistic` đang chờ API. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('CardStore', () => {
  let api: ApiMock;
  let store: InstanceType<typeof CardStore>;

  beforeEach(() => {
    api = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { currentUserId: () => 'user-1' } },
      ],
    });

    store = TestBed.inject(CardStore);
  });

  // ---- loadCards -----------------------------------------------------------

  describe('loadCards', () => {
    it('nạp thẻ, gom theo list và sắp theo position (đường thành công)', async () => {
      api.get.mockResolvedValue([
        makeApiCard({ id: 'c2', listId: 'l1', position: 2 }),
        makeApiCard({ id: 'c1', listId: 'l1', position: 1 }),
        makeApiCard({ id: 'c3', listId: 'l2', position: 1 }),
      ]);

      await store.loadCards('board-1');

      expect(api.get).toHaveBeenCalledWith('/cards?boardId=board-1');
      expect(store.loadedBoardId()).toBe('board-1');
      expect(store.cardsByList()['l1'].map((c) => c.id)).toEqual(['c1', 'c2']);
      expect(store.cardsByList()['l2'].map((c) => c.id)).toEqual(['c3']);
    });

    it('API hỏng thì rỗng danh sách và báo lỗi', async () => {
      api.get.mockRejectedValue(new Error('network down'));

      await store.loadCards('board-1');

      expect(store.entities()).toEqual([]);
      expect(store.lastError()?.message).toBe('Failed to load cards.');
    });

    it('không gọi lại API nếu board không đổi, trừ khi force=true', async () => {
      api.get.mockResolvedValue([]);

      await store.loadCards('board-1');
      await store.loadCards('board-1');
      expect(api.get).toHaveBeenCalledTimes(1);

      await store.loadCards('board-1', true);
      expect(api.get).toHaveBeenCalledTimes(2);
    });
  });

  // ---- createCard ------------------------------------------------------------

  describe('createCard', () => {
    it('tạo thẻ chỉ với title — không gửi PATCH thừa vì mọi trường khác là mặc định', async () => {
      api.post.mockResolvedValue(makeApiCard({ id: 'c1', listId: 'l1', title: 'Mới' }));

      const card = await store.createCard('l1', { title: 'Mới', priority: 'medium' });

      expect(api.post).toHaveBeenCalledWith('/cards', { listId: 'l1', title: 'Mới' });
      expect(api.patch).not.toHaveBeenCalled();
      expect(card?.id).toBe('c1');
      expect(store.entityMap()['c1']).toBeTruthy();
    });

    it('có mô tả/độ ưu tiên thì gửi thêm PATCH bước hai và dùng kết quả patch làm bản cuối', async () => {
      api.post.mockResolvedValue(makeApiCard({ id: 'c1', listId: 'l1' }));
      api.patch.mockResolvedValue(makeApiCard({ id: 'c1', listId: 'l1', priority: 'high', description: 'chi tiết' }));

      const card = await store.createCard('l1', { title: 'Mới', priority: 'high', description: 'chi tiết' });

      expect(api.patch).toHaveBeenCalledWith('/cards/c1', { priority: 'high', description: 'chi tiết' });
      expect(card?.priority).toBe('high');
      expect(store.entityMap()['c1'].description).toBe('chi tiết');
    });

    it('title rỗng thì không gọi API và trả về null', async () => {
      const card = await store.createCard('l1', { title: '   ', priority: 'medium' });
      expect(card).toBeNull();
      expect(api.post).not.toHaveBeenCalled();
    });
  });

  // ---- updateCard: bẫy #1 — hoàn tác phải theo TỪNG entity ------------------

  describe('updateCard — hoàn tác theo entity (bẫy #1)', () => {
    beforeEach(async () => {
      api.get.mockResolvedValue([
        makeApiCard({ id: 'a', listId: 'l1', title: 'A gốc', position: 0 }),
        makeApiCard({ id: 'b', listId: 'l1', title: 'B gốc', position: 1 }),
      ]);
      await store.loadCards('board-1');
    });

    // ---- Xoá trường: `null` phải BAY ĐI, không được im lặng bị bỏ qua --------
    //
    // Bản trước dùng `undefined` cho "người dùng vừa xoá trường này", nhưng
    // `undefined` bị JSON bỏ khỏi body và backend chỉ ghi khi `!== undefined`
    // — nên lệnh xoá không bao giờ tới nơi. Giao diện vẫn hiện đã xoá, F5 thì
    // giá trị cũ quay lại.
    it.each([
      ['assigneeId', { assigneeId: null }],
      ['dueDate', { dueDate: null }],
      ['description', { description: null }],
    ])('gửi null cho %s để backend xoá cột đó', async (truong, changes) => {
      api.patch.mockResolvedValue(makeApiCard({ id: 'a', listId: 'l1' }));

      await store.updateCard('a', changes);

      expect(api.patch).toHaveBeenCalledWith('/cards/a', { [truong]: null });
    });

    it('xoá MỘT MÌNH một trường vẫn gọi API (truoc day patch rong nen bo qua)', async () => {
      api.patch.mockResolvedValue(makeApiCard({ id: 'a', listId: 'l1' }));

      await store.updateCard('a', { assigneeId: null });

      expect(api.patch).toHaveBeenCalledTimes(1);
    });

    it('null cua backend doi thanh undefined o local, khong sinh dang rong thu hai', async () => {
      api.patch.mockResolvedValue(makeApiCard({ id: 'a', listId: 'l1' }));

      await store.updateCard('a', { assigneeId: null, dueDate: null, description: null });

      const the = store.entityMap()['a'];
      expect(the.assigneeId).toBeUndefined();
      expect(the.dueDate).toBeUndefined();
      expect(the.description).toBeUndefined();
    });

    it('đường thành công: sửa đúng thẻ, không đụng thẻ khác', async () => {
      api.patch.mockResolvedValue(makeApiCard({ id: 'a', listId: 'l1', title: 'A sửa' }));

      await store.updateCard('a', { title: 'A sửa' });

      expect(store.entityMap()['a'].title).toBe('A sửa');
      expect(store.entityMap()['b'].title).toBe('B gốc');
    });

    it('API hỏng: chỉ thẻ A hoàn tác — sự kiện WebSocket của thẻ B đến giữa chừng KHÔNG bị xoá', async () => {
      const patchCall = deferred<ApiCard>();
      api.patch.mockReturnValue(patchCall.promise);

      const updatePromise = store.updateCard('a', { title: 'A sửa lạc quan' });
      // Đang chờ API trả lời cho A — giờ một sự kiện WebSocket của thẻ B "đến"
      // (người khác vừa sửa B). Đây chính là kịch bản gây mất dữ liệu ở code cũ.
      store.applyRemoteCard(makeApiCard({ id: 'b', listId: 'l1', title: 'B đổi bởi người khác' }));

      patchCall.reject(new Error('lưu thất bại'));
      await updatePromise;

      // A hoàn tác đúng về bản gốc...
      expect(store.entityMap()['a'].title).toBe('A gốc');
      // ...nhưng thay đổi của B (đến giữa chừng) phải còn nguyên, không bị "set() cả cụm" đè mất.
      expect(store.entityMap()['b'].title).toBe('B đổi bởi người khác');
      expect(store.lastError()?.message).toBe('Failed to save card changes.');
    });
  });

  // ---- deleteCard ------------------------------------------------------------

  describe('deleteCard', () => {
    beforeEach(async () => {
      api.get.mockResolvedValue([
        makeApiCard({ id: 'a', listId: 'l1', position: 0 }),
        makeApiCard({ id: 'b', listId: 'l1', position: 1 }),
      ]);
      await store.loadCards('board-1');
    });

    it('đường thành công: xoá đúng thẻ khỏi state', async () => {
      api.delete.mockResolvedValue(undefined);
      await store.deleteCard('a', 'l1');
      expect(store.entityMap()['a']).toBeUndefined();
      expect(store.entityMap()['b']).toBeTruthy();
    });

    it('API hỏng: khôi phục đúng thẻ vừa xoá, không đụng thẻ khác', async () => {
      const delCall = deferred<void>();
      api.delete.mockReturnValue(delCall.promise);

      const deletePromise = store.deleteCard('a', 'l1');
      store.applyRemoteCard(makeApiCard({ id: 'b', listId: 'l1', title: 'B đổi bởi người khác', position: 1 }));

      delCall.reject(new Error('xoá thất bại'));
      await deletePromise;

      expect(store.entityMap()['a']).toBeTruthy();
      expect(store.entityMap()['b'].title).toBe('B đổi bởi người khác');
      expect(store.lastError()?.message).toBe('Failed to delete card.');
    });
  });

  // ---- moveCardOptimistic: bẫy #2 — chỉ đổi position của ĐÚNG thẻ được kéo --

  describe('moveCardOptimistic — chỉ đổi position của thẻ được kéo (bẫy #2)', () => {
    beforeEach(async () => {
      api.get.mockResolvedValue([
        makeApiCard({ id: 'a', listId: 'l1', position: 0 }),
        makeApiCard({ id: 'b', listId: 'l1', position: 1 }),
        makeApiCard({ id: 'c', listId: 'l1', position: 2 }),
      ]);
      await store.loadCards('board-1');
    });

    it('kéo thẻ đầu xuống cuối: CHỈ position của thẻ đó đổi, hai thẻ còn lại giữ NGUYÊN position gốc', async () => {
      api.patch.mockResolvedValue(makeApiCard({ id: 'a', listId: 'l1' }));

      await store.moveCardOptimistic('a', 'l1', 'l1', 2);

      // b và c KHÔNG bị đánh số lại — đây chính là lỗi cũ (đánh số lại cả cột).
      expect(store.entityMap()['b'].position).toBe(1);
      expect(store.entityMap()['c'].position).toBe(2);
      // a chuyển tới sau c: midpoint(after c, không có "after") = c.position + 1.
      expect(store.entityMap()['a'].position).toBe(3);

      expect(api.patch).toHaveBeenCalledWith('/cards/a/move', { toListId: 'l1', position: 3 });
    });

    it('kéo vào giữa b và c: position mới là trung điểm, không đụng b/c', async () => {
      api.patch.mockResolvedValue(makeApiCard({ id: 'a', listId: 'l1' }));

      await store.moveCardOptimistic('a', 'l1', 'l1', 1);

      expect(store.entityMap()['b'].position).toBe(1);
      expect(store.entityMap()['c'].position).toBe(2);
      expect(store.entityMap()['a'].position).toBe(1.5);
    });

    it('đổi cột kèm đổi priority (kéo qua swimlane): gọi thêm PATCH priority riêng', async () => {
      api.patch.mockResolvedValueOnce(makeApiCard({ id: 'a', listId: 'l2' }));
      api.patch.mockResolvedValueOnce(makeApiCard({ id: 'a', listId: 'l2', priority: 'high' }));

      await store.moveCardOptimistic('a', 'l1', 'l2', 0, 'high');

      expect(api.patch).toHaveBeenNthCalledWith(1, '/cards/a/move', { toListId: 'l2', position: expect.any(Number) });
      expect(api.patch).toHaveBeenNthCalledWith(2, '/cards/a', { priority: 'high' });
      expect(store.entityMap()['a'].listId).toBe('l2');
      expect(store.entityMap()['a'].priority).toBe('high');
    });

    it('API hỏng: hoàn tác đúng thẻ được kéo, đánh dấu errorCardIds, không đụng sự kiện WebSocket đến giữa chừng', async () => {
      const moveCall = deferred<ApiCard>();
      api.patch.mockReturnValue(moveCall.promise);

      const movePromise = store.moveCardOptimistic('a', 'l1', 'l1', 2);
      expect(store.savingCardIds().has('a')).toBe(true);

      store.applyRemoteCard(makeApiCard({ id: 'b', listId: 'l1', title: 'B đổi bởi người khác', position: 1 }));

      moveCall.reject(new Error('lưu vị trí thất bại'));
      await movePromise;

      // a hoàn tác về đúng list + position gốc.
      expect(store.entityMap()['a'].listId).toBe('l1');
      expect(store.entityMap()['a'].position).toBe(0);
      expect(store.savingCardIds().has('a')).toBe(false);
      expect(store.errorCardIds().has('a')).toBe(true);
      // b (đến giữa chừng qua WebSocket) không bị cuốn theo hoàn tác.
      expect(store.entityMap()['b'].title).toBe('B đổi bởi người khác');
    });
  });

  // ---- Handler realtime -------------------------------------------------------

  describe('applyRemoteCard / applyRemoteCardDeleted / clearListCards', () => {
    it('applyRemoteCard: thẻ đổi cột chỉ cần upsert, không tạo bản trùng ở cột cũ', () => {
      store.applyRemoteCard(makeApiCard({ id: 'a', listId: 'l1', position: 0 }));
      store.applyRemoteCard(makeApiCard({ id: 'a', listId: 'l2', position: 0 }));

      expect(store.entities().length).toBe(1);
      expect(store.entityMap()['a'].listId).toBe('l2');
      expect(store.cardsByList()['l1']).toBeUndefined();
      expect(store.cardsByList()['l2'].map((c) => c.id)).toEqual(['a']);
    });

    it('applyRemoteCardDeleted: gỡ đúng 1 thẻ', () => {
      store.applyRemoteCard(makeApiCard({ id: 'a', listId: 'l1' }));
      store.applyRemoteCard(makeApiCard({ id: 'b', listId: 'l1' }));

      store.applyRemoteCardDeleted('a');

      expect(store.entityMap()['a']).toBeUndefined();
      expect(store.entityMap()['b']).toBeTruthy();
    });

    it('clearListCards: xoá mọi thẻ của 1 list, giữ nguyên list khác', () => {
      store.applyRemoteCard(makeApiCard({ id: 'a', listId: 'l1' }));
      store.applyRemoteCard(makeApiCard({ id: 'b', listId: 'l1' }));
      store.applyRemoteCard(makeApiCard({ id: 'c', listId: 'l2' }));

      store.clearListCards('l1');

      expect(store.cardsByList()['l1']).toBeUndefined();
      expect(store.cardsByList()['l2'].map((c) => c.id)).toEqual(['c']);
    });
  });

  // ---- Computed selectors ------------------------------------------------------

  describe('myCards / myDueCounts', () => {
    it('chỉ đếm thẻ quá hạn/sắp đến hạn của đúng người đang đăng nhập', async () => {
      const today = new Date();
      const overdue = new Date(today);
      overdue.setDate(overdue.getDate() - 1);
      const dueSoon = new Date(today);
      dueSoon.setDate(dueSoon.getDate() + 1);

      api.get.mockResolvedValue([
        makeApiCard({ id: 'a', listId: 'l1', assigneeId: 'user-1', dueDate: overdue.toISOString().slice(0, 10) }),
        makeApiCard({ id: 'b', listId: 'l1', assigneeId: 'user-1', dueDate: dueSoon.toISOString().slice(0, 10) }),
        // Thẻ của người khác — không được tính.
        makeApiCard({ id: 'c', listId: 'l1', assigneeId: 'user-2', dueDate: overdue.toISOString().slice(0, 10) }),
      ]);
      await store.loadCards('board-1');

      expect(store.myCards().map((c) => c.id).sort()).toEqual(['a', 'b']);
      expect(store.myDueCounts()).toEqual({ overdue: 1, dueSoon: 1 });
    });
  });
});
