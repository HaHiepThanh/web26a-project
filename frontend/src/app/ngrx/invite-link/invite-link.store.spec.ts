import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ApiService } from '../../services/api.service';
import type { ApiInviteLink } from '../../models';
import { InviteLinkStore } from './invite-link.store';

/** Một link mẫu. `active` do server tính — bài test cũng phải tôn trọng điều đó. */
function link(over: Partial<ApiInviteLink> = {}): ApiInviteLink {
  return {
    id: 'l1',
    orgId: 'o1',
    token: 'tok-abc',
    role: 'member',
    expiresAt: '2030-01-01T00:00:00Z',
    maxUses: null,
    usedCount: 0,
    revokedAt: null,
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    active: true,
    ...over,
  };
}

/** Lỗi HTTP giả, body giống hệt NestJS trả về. */
function httpError(status: number, message: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { message, statusCode: status } });
}

class FakeApi {
  getResult: unknown = [];
  getError: unknown = null;
  postResult: unknown = {};
  postError: unknown = null;
  lastPostBody: unknown = null;
  paths: string[] = [];

  async get<T>(path: string): Promise<T> {
    this.paths.push('GET ' + path);
    if (this.getError) throw this.getError;
    return this.getResult as T;
  }
  async post<T>(path: string, body: unknown): Promise<T> {
    this.paths.push('POST ' + path);
    this.lastPostBody = body;
    if (this.postError) throw this.postError;
    return this.postResult as T;
  }
  async patch<T>(): Promise<T> {
    return {} as T;
  }
  async delete<T>(path: string): Promise<T> {
    this.paths.push('DELETE ' + path);
    return {} as T;
  }
}
describe('InviteLinkStore', () => {
  let api: FakeApi;
  let store: InstanceType<typeof InviteLinkStore>;

  beforeEach(() => {
    api = new FakeApi();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiService, useValue: api }],
    });
    store = TestBed.inject(InviteLinkStore);
    store.clearLinks();
    store.resetPreview();
  });

  describe('phan biet link chet voi link sai', () => {
    it('410 thanh kind gone, giu nguyen cau loi cua backend', async () => {
      api.getError = httpError(410, 'This invite link has expired.');
      await store.loadPreview('tok-abc');

      const p = store.preview();
      expect(p.kind).toBe('gone');
      if (p.kind === 'gone') expect(p.message).toBe('This invite link has expired.');
    });

    it('404 thanh kind invalid, KHONG gop chung voi 410', async () => {
      api.getError = httpError(404, 'Invite link not found.');
      await store.loadPreview('bia-dat');

      // Day la cho ca tinh nang de hong nhat: gop hai ma nay thanh mot cau chung
      // la nguoi dung khong biet nen di xin link moi hay minh go sai.
      expect(store.preview().kind).toBe('invalid');
    });

    it('ma loi khac (500) khong bi nhan nham thanh gone', async () => {
      api.getError = httpError(500, 'Boom');
      await store.loadPreview('tok-abc');
      expect(store.preview().kind).toBe('invalid');
    });
  });

  describe('accept', () => {
    it('thanh cong thi tra ve org de component dieu huong', async () => {
      api.postResult = { orgId: 'o1', orgSlug: 'to-chuc', role: 'member' };
      const res = await store.acceptLink('tok-abc');

      expect(res).toEqual({ orgId: 'o1', orgSlug: 'to-chuc', role: 'member' });
      expect(store.accepting()).toBe(false);
    });

    it('link chet ngay luc bam (410) thi chuyen man sang gone', async () => {
      api.postError = httpError(410, 'This invite link has reached its usage limit.');
      const res = await store.acceptLink('tok-abc');

      expect(res).toBeNull();
      // Chi ghi lastError thi man hinh van hien nut Tham gia da vo dung.
      expect(store.preview().kind).toBe('gone');
    });

    it('loi khac thi ghi lastError va KHONG dung toi preview', async () => {
      api.postError = httpError(500, 'Boom');
      await store.acceptLink('tok-abc');

      expect(store.preview().kind).toBe('idle');
      expect(store.lastError()?.message).toBeTruthy();
    });
  });

  describe('danh sach link', () => {
    it('activeLinks chi lay link server bao con song, moi nhat truoc', async () => {
      api.getResult = [
        link({ id: 'cu', createdAt: '2026-01-01T00:00:00Z', active: true }),
        link({ id: 'chet', createdAt: '2026-01-03T00:00:00Z', active: false }),
        link({ id: 'moi', createdAt: '2026-01-02T00:00:00Z', active: true }),
      ];
      await store.loadLinks('o1');

      expect(store.activeLinks().map((l) => l.id)).toEqual(['moi', 'cu']);
    });

    it('thanh vien thuong (403) khong thanh thong bao loi do', async () => {
      api.getError = httpError(403, 'Forbidden');
      await store.loadLinks('o1');

      expect(store.lastError()).toBeNull();
      expect(store.links()).toEqual([]);
    });

    it('doi to chuc thi xoa link cu truoc khi nap, khong de lan', async () => {
      api.getResult = [link({ id: 'cua-o1', orgId: 'o1' })];
      await store.loadLinks('o1');
      expect(store.links().length).toBe(1);

      api.getResult = [link({ id: 'cua-o2', orgId: 'o2' })];
      await store.loadLinks('o2');

      expect(store.links().map((l) => l.id)).toEqual(['cua-o2']);
    });

    it('thu hoi thi danh dau chet chu khong xoa khoi danh sach', async () => {
      api.getResult = [link({ id: 'l1' })];
      await store.loadLinks('o1');

      await store.revokeLink('l1');

      // Van con trong links (de nguoi vua bam thay no doi trang thai)...
      expect(store.links().length).toBe(1);
      expect(store.links()[0].active).toBe(false);
      // ...nhung da roi khoi danh sach link dung duoc.
      expect(store.activeLinks()).toEqual([]);
      expect(store.revoking().has('l1')).toBe(false);
    });
  });

  describe('tao link', () => {
    it('goi dung duong dan quan ly cua to chuc', async () => {
      api.postResult = link({ id: 'moi' });
      await store.createLink('o1', { expiresInDays: 7, role: 'admin' });

      expect(api.paths).toContain('POST /organizations/o1/invite-links');
      expect(api.lastPostBody).toEqual({ expiresInDays: 7, role: 'admin' });
    });

    it('link moi nam dau danh sach ngay, khong can nap lai', async () => {
      api.getResult = [link({ id: 'cu', createdAt: '2026-01-01T00:00:00Z' })];
      await store.loadLinks('o1');

      api.postResult = link({ id: 'moi', createdAt: '2026-06-01T00:00:00Z' });
      await store.createLink('o1', {});

      expect(store.links()[0].id).toBe('moi');
    });
  });

  it('clearLinks bo token khoi bo nho khi dong man quan ly', async () => {
    api.getResult = [link()];
    await store.loadLinks('o1');
    expect(store.links().length).toBe(1);

    store.clearLinks();

    expect(store.links()).toEqual([]);
    expect(store.loadedForOrg()).toBeNull();
  });
});
