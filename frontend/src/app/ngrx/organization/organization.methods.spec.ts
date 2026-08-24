import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { FirebaseService } from '../../services/firebase.service';
import { RealtimeService } from '../../services/realtime.service';
import { OrganizationStore } from './organization.store';

/**
 * Vòng test thứ hai: các thao tác GHI.
 *
 * Vòng đầu (`organization.store.spec.ts`) lo phần nạp và cuộc đua token. Ở đây
 * kiểm tra đúng hai điều cho mỗi method ghi:
 *   1. gọi đúng METHOD + URL + body — sai một ký tự là backend trả 404 mà giao
 *      diện chỉ hiện "Có lỗi xảy ra", rất khó lần ra;
 *   2. backend trả lỗi thì method trả về CÂU TIẾNG VIỆT chứ không ném ra ngoài.
 */

interface Ghi {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  body?: unknown;
}

/** Backend giả có ghi nhật ký mọi lần gọi, và bật lỗi được cho từng đường dẫn. */
class SpyApi {
  readonly log: Ghi[] = [];
  failOn: string | null = null;
  failStatus = 500;
  failMessage: string | string[] | null = null;

  private maybeFail(path: string): void {
    if (this.failOn && path.startsWith(this.failOn)) {
      throw new HttpErrorResponse({
        status: this.failStatus,
        error: this.failMessage === null ? null : { message: this.failMessage },
      });
    }
  }

  async get<T>(path: string): Promise<T> {
    this.log.push({ method: 'get', path });
    this.maybeFail(path);
    if (path === '/organizations') {
      return [{ id: 'o1', name: 'Alpha', slug: 'alpha', role: 'owner' }] as unknown as T;
    }
    if (path.endsWith('/members')) {
      return [
        {
          userId: 'u1',
          role: 'owner',
          joinedAt: '2026-01-01T00:00:00Z',
          user: { displayName: 'Huy', email: 'huy@test.dev', avatarUrl: null },
        },
      ] as unknown as T;
    }
    if (path.endsWith('/invites')) {
      return [
        {
          id: 'p1',
          orgId: 'o1',
          toUserId: 'u9',
          fromUserId: 'u1',
          role: 'member',
          createdAt: '2026-01-03T00:00:00Z',
          toUser: { displayName: 'Người Lạ', email: 'la@test.dev', avatarUrl: null },
        },
      ] as unknown as T;
    }
    return [] as unknown as T;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    this.log.push({ method: 'post', path, body });
    this.maybeFail(path);
    return { id: 'o1', name: 'Alpha', slug: 'alpha' } as unknown as T;
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    this.log.push({ method: 'patch', path, body });
    this.maybeFail(path);
    return {} as T;
  }

  async delete<T>(path: string): Promise<T> {
    this.log.push({ method: 'delete', path });
    this.maybeFail(path);
    return {} as T;
  }

  /** Lần gọi khớp method + đoạn đường dẫn, bỏ qua các lần nạp lại xen giữa. */
  find(method: Ghi['method'], contains: string): Ghi | undefined {
    return this.log.find((g) => g.method === method && g.path.includes(contains));
  }
}

class FakeFirebase {
  async getIdToken(): Promise<string | null> {
    return 'token';
  }
  async waitForAuthReady(): Promise<null> {
    return null;
  }
}

class FakeRealtime {
  onBoardEvent(): () => void {
    return () => undefined;
  }
  onUserEvent(): () => void {
    return () => undefined;
  }
}

function setup() {
  const api = new SpyApi();
  const currentUser = signal<{ id: string } | null>({ id: 'u1' });

  TestBed.configureTestingModule({
    providers: [
      { provide: ApiService, useValue: api },
      { provide: FirebaseService, useValue: new FakeFirebase() },
      { provide: RealtimeService, useValue: new FakeRealtime() },
      { provide: AuthService, useValue: { currentUser } },
    ],
  });

  return { store: TestBed.inject(OrganizationStore), api, currentUser };
}

describe('OrganizationStore — thao tác ghi', () => {
  it('createOrg: POST /organizations với name và slug đã trim', async () => {
    const { store, api } = setup();

    const kq = await store.createOrg('  Alpha  ', '  alpha  ');

    const goi = api.find('post', '/organizations');
    expect(goi?.body).toEqual({ name: 'Alpha', slug: 'alpha' });
    expect(kq.error).toBeUndefined();
    // Tạo xong phải nạp lại để tổ chức mới hiện ngay ở bộ chuyển.
    expect(api.find('get', '/organizations')).toBeDefined();
  });

  it('createOrg: slug trùng thì trả câu lỗi của backend, không ném ra ngoài', async () => {
    const { store, api } = setup();
    api.failOn = '/organizations';
    api.failStatus = 409;
    api.failMessage = 'Đường dẫn "alpha" đã có người dùng.';

    const kq = await store.createOrg('Alpha', 'alpha');

    expect(kq.org).toBeUndefined();
    expect(kq.error).toBe('Đường dẫn "alpha" đã có người dùng.');
  });

  it('inviteMember: chặn tự mời chính mình TRƯỚC khi gọi API', async () => {
    const { store, api } = setup();

    const loi = await store.inviteMember('o1', 'u1');

    expect(loi).toBe('Bạn không thể tự mời chính mình.');
    // Quan trọng: không được bay một request vô ích lên server.
    expect(api.find('post', '/invites')).toBeUndefined();
  });

  it('inviteMember: POST đúng đường dẫn, kèm role, uid đã trim', async () => {
    const { store, api } = setup();

    const loi = await store.inviteMember('o1', '  u9  ', 'admin');

    expect(loi).toBeNull();
    const goi = api.find('post', '/organizations/o1/invites');
    expect(goi).toBeDefined();
    expect(goi?.body).toEqual({ toUserId: 'u9', role: 'admin' });
  });

  it('inviteMember: mặc định role là member khi không truyền', async () => {
    const { store, api } = setup();

    await store.inviteMember('o1', 'u9');

    expect(api.find('post', '/invites')?.body).toEqual({ toUserId: 'u9', role: 'member' });
  });

  it('respondInvite: PATCH /organizations/invites/:id với accept', async () => {
    const { store, api } = setup();

    const loi = await store.respondInvite('i1', true);

    expect(loi).toBeNull();
    const goi = api.find('patch', '/organizations/invites/i1');
    expect(goi?.body).toEqual({ accept: true });
  });

  it('removeMember: DELETE đúng đường dẫn rồi nạp lại', async () => {
    const { store, api } = setup();

    const loi = await store.removeMember('o1', 'u9');

    expect(loi).toBeNull();
    expect(api.find('delete', '/organizations/o1/members/u9')).toBeDefined();
    expect(api.find('get', '/organizations')).toBeDefined();
  });

  it('removeMember: backend từ chối thì trả câu lỗi của backend', async () => {
    const { store, api } = setup();
    api.failOn = '/organizations/o1/members';
    api.failStatus = 400;
    api.failMessage = 'Không xoá được owner. Hãy chuyển quyền owner cho người khác trước.';

    const loi = await store.removeMember('o1', 'u1');

    expect(loi).toBe('Không xoá được owner. Hãy chuyển quyền owner cho người khác trước.');
  });

  it('changeRole: PATCH .../members/:userId/role', async () => {
    const { store, api } = setup();

    await store.changeRole('o1', 'u9', 'admin');

    const goi = api.find('patch', '/organizations/o1/members/u9/role');
    expect(goi?.body).toEqual({ role: 'admin' });
  });

  it('updateOrg: tên rỗng thì báo lỗi ngay, không gọi API', async () => {
    const { store, api } = setup();

    const loi = await store.updateOrg('o1', { name: '   ' });

    expect(loi).toBe('Tên tổ chức không được để trống.');
    expect(api.find('patch', '/organizations/o1')).toBeUndefined();
  });

  it('updateOrg: gửi tên đã trim', async () => {
    const { store, api } = setup();

    const loi = await store.updateOrg('o1', { name: '  Tên mới  ' });

    expect(loi).toBeNull();
    expect(api.find('patch', '/organizations/o1')?.body).toEqual({ name: 'Tên mới' });
  });

  it('loadPendingInvites: map đúng, tên hiển thị lấy từ người ĐƯỢC MỜI', async () => {
    const { store } = setup();

    await store.loadPendingInvites('o1');

    const ds = store.pendingInvitesFor('o1');
    expect(ds.length).toBe(1);
    expect(ds[0].id).toBe('p1');
    expect(ds[0].fromUserName).toBe('Người Lạ');
  });

  it('loadPendingInvites: bị 403 thì trả mảng rỗng, KHÔNG ném lỗi', async () => {
    const { store, api } = setup();
    api.failOn = '/organizations/o1/invites';
    api.failStatus = 403;

    await store.loadPendingInvites('o1');

    // Thành viên thường không có quyền xem — modal đã ẩn khối đó, không phải
    // lỗi cần báo động.
    expect(store.pendingInvitesFor('o1')).toEqual([]);
    expect(store.lastError()).toBeNull();
  });

  it('mất mạng thì mọi method ghi đều trả câu nhắc bật backend', async () => {
    const { store, api } = setup();
    api.failOn = '/organizations';
    api.failStatus = 0;

    const loi = await store.changeRole('o1', 'u9', 'admin');

    expect(loi).toContain("Couldn't reach the server");
  });

  it('switchOrg: bỏ qua id không có trong danh sách', async () => {
    const { store } = setup();
    await store.ensureLoaded();

    store.switchOrg('khong-ton-tai');

    // Vẫn giữ tổ chức đang chọn, không nhảy sang null.
    expect(store.activeOrgId()).toBe('o1');
  });

  it('clearAll: đăng xuất là xoá sạch, không để lại dữ liệu người trước', async () => {
    const { store } = setup();
    await store.ensureLoaded();
    expect(store.entities().length).toBe(1);

    store.clearAll();

    expect(store.entities().length).toBe(0);
    expect(store.activeOrgId()).toBeNull();
    expect(store.loadedForUid()).toBeNull();
    expect(store.pendingInviteCount()).toBe(0);
  });
});
