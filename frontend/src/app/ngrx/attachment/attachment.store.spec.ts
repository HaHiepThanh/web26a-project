import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ApiAttachment } from '../../models';
import { ApiService } from '../../services/api.service';
import { AttachmentStore } from './attachment.store';

interface ApiMock {
  get: Mock;
  upload: Mock;
  patch: Mock;
  delete: Mock;
}

function makeApiAttachment(overrides: Partial<ApiAttachment> & { id: string; cardId: string }): ApiAttachment {
  return {
    name: 'file.png',
    mimeType: 'image/png',
    sizeBytes: 1000,
    isImage: true,
    isCover: false,
    uploadedBy: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    url: 'https://signed-url/file.png',
    ...overrides,
  };
}

function makeFile(name: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name, { type: 'image/png' });
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

describe('AttachmentStore', () => {
  let api: ApiMock;
  let store: InstanceType<typeof AttachmentStore>;

  beforeEach(() => {
    api = { get: vi.fn(), upload: vi.fn(), patch: vi.fn(), delete: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: ApiService, useValue: api }],
    });
    store = TestBed.inject(AttachmentStore);
  });

  describe('loadAttachments', () => {
    it('nạp đính kèm, gom theo card, sắp theo thời gian tạo', async () => {
      api.get.mockResolvedValue([
        makeApiAttachment({ id: 'a2', cardId: 'c1', createdAt: '2026-01-02T00:00:00.000Z' }),
        makeApiAttachment({ id: 'a1', cardId: 'c1', createdAt: '2026-01-01T00:00:00.000Z' }),
      ]);

      await store.loadAttachments('c1');

      expect(api.get).toHaveBeenCalledWith('/attachments?cardId=c1');
      expect(store.attachmentsFor('c1').map((a) => a.id)).toEqual(['a1', 'a2']);
    });

    it('không gọi lại API trong 45 phút trừ khi force=true', async () => {
      api.get.mockResolvedValue([]);
      await store.loadAttachments('c1');
      await store.loadAttachments('c1');
      expect(api.get).toHaveBeenCalledTimes(1);

      await store.loadAttachments('c1', true);
      expect(api.get).toHaveBeenCalledTimes(2);
    });

    it('API hỏng thì báo lỗi', async () => {
      api.get.mockRejectedValue(new Error('network down'));
      await store.loadAttachments('c1');
      expect(store.lastError()?.message).toBe('Failed to load attachments.');
    });
  });

  describe('addFiles', () => {
    it('tải lên tuần tự từng tệp, upsert vào đúng card', async () => {
      api.upload
        .mockResolvedValueOnce(makeApiAttachment({ id: 'a1', cardId: 'c1', name: 'a.png' }))
        .mockResolvedValueOnce(makeApiAttachment({ id: 'a2', cardId: 'c1', name: 'b.png' }));

      const added = await store.addFiles('c1', [makeFile('a.png', 100), makeFile('b.png', 100)]);

      expect(api.upload).toHaveBeenCalledTimes(2);
      expect(added.map((a) => a.name)).toEqual(['a.png', 'b.png']);
      expect(store.attachmentsFor('c1').map((a) => a.id).sort()).toEqual(['a1', 'a2']);
      expect(store.uploading()).toBe(false); // tắt lại sau khi xong, kể cả có lỗi
    });

    it('tệp quá 10MB thì bị chặn cục bộ, không gọi API', async () => {
      const bigFile = makeFile('big.png', 11 * 1024 * 1024);
      const added = await store.addFiles('c1', [bigFile]);

      expect(api.upload).not.toHaveBeenCalled();
      expect(added).toEqual([]);
      expect(store.lastError()?.message).toContain('big.png');
    });

    it('1 tệp lỗi không chặn các tệp còn lại', async () => {
      api.upload
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce(makeApiAttachment({ id: 'a2', cardId: 'c1', name: 'b.png' }));

      const added = await store.addFiles('c1', [makeFile('a.png', 100), makeFile('b.png', 100)]);

      expect(added.map((a) => a.name)).toEqual(['b.png']);
      expect(store.attachmentsFor('c1').length).toBe(1);
    });
  });

  describe('remove — hoàn tác theo entity', () => {
    beforeEach(async () => {
      api.get.mockResolvedValue([
        makeApiAttachment({ id: 'a', cardId: 'c1' }),
        makeApiAttachment({ id: 'b', cardId: 'c1' }),
      ]);
      await store.loadAttachments('c1');
    });

    it('đường thành công: xoá đúng tệp', async () => {
      api.delete.mockResolvedValue(undefined);
      await store.remove('c1', 'a');
      expect(store.entityMap()['a']).toBeUndefined();
      expect(store.entityMap()['b']).toBeTruthy();
    });

    it('API hỏng: khôi phục đúng tệp vừa xoá — sự kiện WS của tệp khác đến giữa chừng không mất', async () => {
      const delCall = deferred<void>();
      api.delete.mockReturnValue(delCall.promise);

      const removePromise = store.remove('c1', 'a');
      store.applyRemote(makeApiAttachment({ id: 'c', cardId: 'c1', name: 'moi-toi.png' }));

      delCall.reject(new Error('xoá thất bại'));
      await removePromise;

      expect(store.entityMap()['a']).toBeTruthy();
      expect(store.entityMap()['c']).toBeTruthy();
      expect(store.lastError()?.message).toBe('Failed to delete attachment.');
    });
  });

  describe('toggleCover', () => {
    beforeEach(async () => {
      api.get.mockResolvedValue([
        makeApiAttachment({ id: 'a', cardId: 'c1', isCover: true, isImage: true }),
        makeApiAttachment({ id: 'b', cardId: 'c1', isCover: false, isImage: true }),
        makeApiAttachment({ id: 'pdf', cardId: 'c1', isCover: false, isImage: false }),
      ]);
      await store.loadAttachments('c1');
    });

    it('đặt ảnh khác làm bìa: gỡ cờ bìa của ảnh cũ, không đụng tệp không phải ảnh', async () => {
      api.patch.mockResolvedValue(makeApiAttachment({ id: 'b', cardId: 'c1', isCover: true }));
      await store.toggleCover('c1', 'b');

      expect(store.entityMap()['b'].isCover).toBe(true);
      expect(store.entityMap()['a'].isCover).toBe(false); // bìa cũ bị gỡ
      expect(store.entityMap()['pdf'].isCover).toBe(false);
    });

    it('bấm vào tệp không phải ảnh thì không làm gì, không gọi API', async () => {
      await store.toggleCover('c1', 'pdf');
      expect(api.patch).not.toHaveBeenCalled();
    });

    it('API hỏng: hoàn tác đúng 2 entity bị đổi (đích + bìa cũ), không đụng tệp khác', async () => {
      const patchCall = deferred<ApiAttachment>();
      api.patch.mockReturnValue(patchCall.promise);

      const togglePromise = store.toggleCover('c1', 'b');
      // Đang chờ API — một sự kiện WebSocket của tệp khác (pdf đổi tên chẳng hạn) đến giữa chừng.
      store.applyRemote(makeApiAttachment({ id: 'pdf', cardId: 'c1', isImage: false, name: 'renamed.pdf' }));

      patchCall.reject(new Error('lưu thất bại'));
      await togglePromise;

      expect(store.entityMap()['b'].isCover).toBe(false); // hoàn tác đúng
      expect(store.entityMap()['a'].isCover).toBe(true); // bìa cũ khôi phục lại
      expect(store.entityMap()['pdf'].name).toBe('renamed.pdf'); // không bị cuốn theo hoàn tác
      expect(store.lastError()?.message).toBe('Failed to set cover image.');
    });
  });

  describe('applyRemote / applyRemoteDeleted / clearCard', () => {
    it('bỏ qua sự kiện remote nếu card chưa từng loadAttachments', () => {
      store.applyRemote(makeApiAttachment({ id: 'a', cardId: 'c-chua-mo' }));
      expect(store.entities().length).toBe(0);
    });

    it('applyRemote: ảnh mới thành bìa thì tự gỡ cờ bìa ảnh cũ trong cùng card', async () => {
      api.get.mockResolvedValue([makeApiAttachment({ id: 'a', cardId: 'c1', isCover: true })]);
      await store.loadAttachments('c1');

      store.applyRemote(makeApiAttachment({ id: 'b', cardId: 'c1', isCover: true }));

      expect(store.entityMap()['b'].isCover).toBe(true);
      expect(store.entityMap()['a'].isCover).toBe(false);
    });

    it('applyRemoteDeleted: gỡ đúng 1 tệp khỏi card đã mở', async () => {
      api.get.mockResolvedValue([makeApiAttachment({ id: 'a', cardId: 'c1' }), makeApiAttachment({ id: 'b', cardId: 'c1' })]);
      await store.loadAttachments('c1');
      store.applyRemoteDeleted('c1', 'a');
      expect(store.entityMap()['a']).toBeUndefined();
      expect(store.entityMap()['b']).toBeTruthy();
    });

    it('clearCard: xoá mọi tệp của 1 card, giữ nguyên card khác, cho phép loadAttachments lại', async () => {
      api.get.mockResolvedValueOnce([makeApiAttachment({ id: 'a', cardId: 'c1' })]);
      await store.loadAttachments('c1');
      api.get.mockResolvedValueOnce([makeApiAttachment({ id: 'x', cardId: 'c2' })]);
      await store.loadAttachments('c2');

      store.clearCard('c1');

      expect(store.attachmentsFor('c1')).toEqual([]);
      expect(store.attachmentsFor('c2').map((a) => a.id)).toEqual(['x']);

      api.get.mockResolvedValueOnce([makeApiAttachment({ id: 'a2', cardId: 'c1' })]);
      await store.loadAttachments('c1');
      expect(api.get).toHaveBeenCalledTimes(3);
    });
  });

  describe('countByCard / coverUrlByCard', () => {
    it('tính đúng, bỏ qua card rỗng và ảnh không phải bìa', async () => {
      api.get.mockResolvedValueOnce([
        makeApiAttachment({ id: 'a', cardId: 'c1', isCover: true, isImage: true, url: 'https://x/a.png' }),
        makeApiAttachment({ id: 'b', cardId: 'c1', isCover: false }),
      ]);
      await store.loadAttachments('c1');

      expect(store.countByCard()['c1']).toBe(2);
      expect(store.coverUrlByCard()['c1']).toBe('https://x/a.png');
      expect(store.countByCard()['c-khong-ton-tai']).toBeUndefined();
    });
  });
});
