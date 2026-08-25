import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ApiBoardMember } from '../../models';
import { ApiService } from '../../services/api.service';
import { ManageWorkspaceStore } from './manage-workspace.store';
import type { BoardMemberView } from './manage-workspace.state';

interface ApiMock {
  get: Mock;
  patch: Mock;
}

function apiMember(userId: string, displayName: string | null = 'Người dùng'): ApiBoardMember {
  return {
    userId,
    user: {
      id: userId,
      email: `${userId}@test.dev`,
      displayName,
      avatarUrl: null,
    },
  };
}

function view(userId: string): BoardMemberView {
  return {
    userId,
    user: { id: userId, email: `${userId}@test.dev`, displayName: 'Người dùng', avatarUrl: undefined },
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

describe('ManageWorkspaceStore', () => {
  let api: ApiMock;
  let store: InstanceType<typeof ManageWorkspaceStore>;

  beforeEach(() => {
    api = { get: vi.fn(), patch: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: ApiService, useValue: api }],
    });
    store = TestBed.inject(ManageWorkspaceStore);
  });

  describe('loadBoardMembers', () => {
    it('nạp thành viên của board (đường thành công)', async () => {
      api.get.mockResolvedValue([apiMember('u1'), apiMember('u2')]);
      await store.loadBoardMembers('b1');

      expect(api.get).toHaveBeenCalledWith('/boards/b1/members');
      expect(store.membersOf('b1').map((m) => m.userId)).toEqual(['u1', 'u2']);
      expect(store.hasLoaded('b1')).toBe(true);
    });

    it('đổi null của backend thành undefined để khớp kiểu User', async () => {
      api.get.mockResolvedValue([apiMember('u1', null)]);
      await store.loadBoardMembers('b1');

      const [m] = store.membersOf('b1');
      expect(m.user?.displayName).toBeUndefined();
      expect(m.user?.avatarUrl).toBeUndefined();
    });

    it('giữ nguyên dòng có user null thay vì bỏ đi', async () => {
      api.get.mockResolvedValue([{ userId: 'u9', user: null } satisfies ApiBoardMember]);
      await store.loadBoardMembers('b1');

      expect(store.membersOf('b1')).toEqual([{ userId: 'u9', user: null }]);
    });

    it('không gọi lại API cho board đã nạp, trừ khi force=true', async () => {
      api.get.mockResolvedValue([]);
      await store.loadBoardMembers('b1');
      await store.loadBoardMembers('b1');
      expect(api.get).toHaveBeenCalledTimes(1);

      await store.loadBoardMembers('b1', true);
      expect(api.get).toHaveBeenCalledTimes(2);
    });

    it('API hỏng → ghi lỗi và KHÔNG đánh dấu đã nạp (lần sau còn thử lại được)', async () => {
      api.get.mockRejectedValue(new Error('mạng hỏng'));
      await store.loadBoardMembers('b1');

      expect(store.lastError()?.message).toBeTruthy();
      expect(store.hasLoaded('b1')).toBe(false);

      api.get.mockResolvedValue([apiMember('u1')]);
      await store.loadBoardMembers('b1');
      expect(store.membersOf('b1')).toHaveLength(1);
    });
  });

  describe('loadManyBoardMembers', () => {
    it('nạp song song và gộp vào một lần ghi state', async () => {
      api.get.mockImplementation((path: string) =>
        Promise.resolve([apiMember(path.includes('b1') ? 'u1' : 'u2')]),
      );
      await store.loadManyBoardMembers(['b1', 'b2']);

      expect(api.get).toHaveBeenCalledTimes(2);
      expect(store.membersOf('b1').map((m) => m.userId)).toEqual(['u1']);
      expect(store.membersOf('b2').map((m) => m.userId)).toEqual(['u2']);
    });

    it('một board hỏng KHÔNG làm hỏng cả mẻ', async () => {
      api.get.mockImplementation((path: string) =>
        path.includes('b2') ? Promise.reject(new Error('403')) : Promise.resolve([apiMember('u1')]),
      );
      await store.loadManyBoardMembers(['b1', 'b2']);

      expect(store.membersOf('b1')).toHaveLength(1);
      expect(store.hasLoaded('b1')).toBe(true);
      expect(store.hasLoaded('b2')).toBe(false);
      expect(store.lastError()?.message).toContain('1 project(s)');
    });

    it('bỏ qua board đã nạp và id trùng', async () => {
      api.get.mockResolvedValue([]);
      await store.loadBoardMembers('b1');
      api.get.mockClear();

      await store.loadManyBoardMembers(['b1', 'b2', 'b2']);
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(api.get).toHaveBeenCalledWith('/boards/b2/members');
    });
  });

  describe('setBoardMembers', () => {
    it('gửi danh sách đầy đủ dưới dạng memberIds', async () => {
      api.get.mockResolvedValue([apiMember('u1')]);
      await store.loadBoardMembers('b1');
      api.patch.mockResolvedValue({});

      const error = await store.setBoardMembers('b1', [view('u1'), view('u2')]);

      expect(error).toBeNull();
      expect(api.patch).toHaveBeenCalledWith('/boards/b1', { memberIds: ['u1', 'u2'] });
      expect(store.membersOf('b1').map((m) => m.userId)).toEqual(['u1', 'u2']);
    });

    it('API hỏng → hoàn tác ĐÚNG board đó, không đụng board khác', async () => {
      api.get.mockImplementation((path: string) =>
        Promise.resolve([apiMember(path.includes('b1') ? 'u1' : 'u9')]),
      );
      await store.loadManyBoardMembers(['b1', 'b2']);

      // Một sự kiện của board khác lọt vào giữa lúc chờ API: `b2` được nạp lại
      // xong TRƯỚC khi PATCH của `b1` trả lời. Hoàn tác bằng cách chép đè cả map
      // sẽ xoá mất kết quả đó — đây là bài kiểm chính cho luật "chỉ trả lại đúng
      // phần mình đã đụng".
      const pending = deferred<unknown>();
      api.patch.mockReturnValue(pending.promise);
      const saving = store.setBoardMembers('b1', [view('u1'), view('u2')]);

      api.get.mockResolvedValue([apiMember('u9'), apiMember('u10')]);
      await store.loadBoardMembers('b2', true);

      pending.reject(new Error('500'));
      const error = await saving;

      expect(error).toBeTruthy();
      expect(store.membersOf('b1').map((m) => m.userId)).toEqual(['u1']);
      expect(store.membersOf('b2').map((m) => m.userId)).toEqual(['u9', 'u10']);
    });

    it('chan lenh ghi thu hai khi lenh dau chua ve', async () => {
      api.get.mockResolvedValue([apiMember('me')]);
      await store.loadBoardMembers('b1');

      const pending = deferred<unknown>();
      api.patch.mockReturnValue(pending.promise);

      const first = store.setBoardMembers('b1', [view('me'), view('X')]);
      const second = await store.setBoardMembers('b1', [view('me'), view('X'), view('Y')]);

      // Lệnh thứ hai bị từ chối THẲNG, chưa từng bay đi.
      expect(second).toContain('still saving');
      expect(api.patch).toHaveBeenCalledTimes(1);

      pending.resolve({});
      expect(await first).toBeNull();

      // Khoá phải mở lại, không thì bấm lần sau bị chặn vĩnh viễn.
      api.patch.mockResolvedValue({});
      expect(await store.setBoardMembers('b1', [view('me')])).toBeNull();
    });

    it('lenh hong KHONG dap ban hoan tac cu len ket qua cua lenh sau', async () => {
      // Đây là hình dạng của lỗi đã tái hiện trên trình duyệt: hai lệnh chồng
      // nhau, lệnh đầu hỏng, bản chụp hoàn tác của nó đã cũ → đắp đè lên là xoá
      // sạch người mà lệnh sau vừa thêm thành công. Khoá phải làm nó bất khả thi.
      api.get.mockResolvedValue([apiMember('me')]);
      await store.loadBoardMembers('b1');

      const pending = deferred<unknown>();
      api.patch.mockReturnValueOnce(pending.promise);

      const first = store.setBoardMembers('b1', [view('me'), view('X')]);
      await store.setBoardMembers('b1', [view('me'), view('X'), view('Y')]); // bị chặn
      pending.reject(new Error('500'));
      await first;

      // Chỉ lệnh đầu từng chạy, nên hoàn tác về đúng trạng thái trước nó.
      expect(store.membersOf('b1').map((m) => m.userId)).toEqual(['me']);
    });

    it('khoa la theo TUNG board, khong chan board khac', async () => {
      const pending = deferred<unknown>();
      api.patch.mockReturnValueOnce(pending.promise).mockResolvedValue({});

      const onB1 = store.setBoardMembers('b1', [view('X')]);
      const onB2 = await store.setBoardMembers('b2', [view('Y')]);

      expect(onB2).toBeNull();
      expect(api.patch).toHaveBeenCalledWith('/boards/b2', { memberIds: ['Y'] });

      pending.resolve({});
      await onB1;
    });

    it('hỏng khi board chưa từng nạp → xoá hẳn khoá, không để lại danh sách ma', async () => {
      api.patch.mockRejectedValue(new Error('400'));
      const error = await store.setBoardMembers('b1', [view('u1')]);

      expect(error).toBeTruthy();
      expect(store.membersOf('b1')).toEqual([]);
      expect(store.hasLoaded('b1')).toBe(false);
    });
  });

  it('clearAll dọn sạch state', async () => {
    api.get.mockResolvedValue([apiMember('u1')]);
    await store.loadBoardMembers('b1');

    store.clearAll();
    expect(store.membersOf('b1')).toEqual([]);
    expect(store.hasLoaded('b1')).toBe(false);
  });
});
