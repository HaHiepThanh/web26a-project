import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { FirebaseService } from '../../services/firebase.service';
import { RealtimeService } from '../../services/realtime.service';
import { OrganizationStore } from './organization.store';

/**
 * Dữ liệu backend giả — đủ ba endpoint mà `fetchFromServer` gọi.
 *
 * Cố ý đặt tên "Zulu" trước "Alpha" để bài test sắp xếp có ý nghĩa: nếu store
 * quên sắp lại thì `organizations()` sẽ ra đúng thứ tự này và test đỏ.
 */
const API_ORGS = [
  { id: 'o2', name: 'Zulu', slug: 'zulu', role: 'member' as const },
  { id: 'o1', name: 'Alpha', slug: 'alpha', role: 'owner' as const },
];

const MEMBERS: Record<string, unknown[]> = {
  o1: [
    {
      userId: 'u1',
      role: 'owner',
      joinedAt: '2026-01-01T00:00:00Z',
      user: { displayName: 'Huy', email: 'huy@test.dev', avatarUrl: null },
    },
  ],
  o2: [
    {
      userId: 'u9',
      role: 'owner',
      joinedAt: '2026-01-01T00:00:00Z',
      user: { displayName: 'Ai đó', email: 'aido@test.dev', avatarUrl: null },
    },
    {
      userId: 'u1',
      role: 'member',
      joinedAt: '2026-01-02T00:00:00Z',
      user: { displayName: 'Huy', email: 'huy@test.dev', avatarUrl: null },
    },
  ],
};

/** Backend giả: đếm số lần gọi và cho phép bật/tắt lỗi giữa chừng. */
class FakeApi {
  calls = 0;
  failNext = false;

  async get<T>(path: string): Promise<T> {
    this.calls++;
    if (this.failNext) {
      throw new HttpErrorResponse({ status: 500, statusText: 'Server Error' });
    }
    if (path === '/organizations') return API_ORGS as unknown as T;
    if (path === '/organizations/invites/me') return [] as unknown as T;
    const m = /^\/organizations\/([^/]+)\/members$/.exec(path);
    if (m) return (MEMBERS[m[1]] ?? []) as unknown as T;
    return [] as unknown as T;
  }

  async post<T>(): Promise<T> {
    return {} as T;
  }
  async patch<T>(): Promise<T> {
    return {} as T;
  }
  async delete<T>(): Promise<T> {
    return {} as T;
  }
}

/**
 * Firebase giả — điểm mấu chốt của bài test quan trọng nhất.
 *
 * `tokens` là hàng đợi: mỗi lần `getIdToken()` lấy ra một giá trị. Cho phép mô
 * phỏng đúng cảnh đời thật — lần đầu chưa khôi phục xong phiên nên trả null,
 * vài trăm mili-giây sau mới có token.
 */
class FakeFirebase {
  tokens: Array<string | null> = [];
  async getIdToken(): Promise<string | null> {
    return this.tokens.length ? (this.tokens.shift() ?? null) : 'token';
  }
  async waitForAuthReady(): Promise<null> {
    return null;
  }
}

/** RealtimeService giả — không mở socket thật, chỉ ghi nhận đăng ký. */
class FakeRealtime {
  registered: string[] = [];
  onBoardEvent(type: string): () => void {
    this.registered.push('board:' + type);
    return () => undefined;
  }
  onUserEvent(type: string): () => void {
    this.registered.push('user:' + type);
    return () => undefined;
  }
}

function setup(tokens: Array<string | null> = []) {
  const api = new FakeApi();
  const firebase = new FakeFirebase();
  firebase.tokens = tokens;
  const realtime = new FakeRealtime();
  const currentUser = signal<{ id: string } | null>({ id: 'u1' });

  TestBed.configureTestingModule({
    providers: [
      { provide: ApiService, useValue: api },
      { provide: FirebaseService, useValue: firebase },
      { provide: RealtimeService, useValue: realtime },
      { provide: AuthService, useValue: { currentUser } },
    ],
  });

  const store = TestBed.inject(OrganizationStore);
  return { store, api, firebase, realtime, currentUser };
}

describe('OrganizationStore', () => {
  /**
   * ⭐ BÀI TEST QUAN TRỌNG NHẤT — cuộc đua lúc khởi động (mục 4 tài liệu).
   *
   * `AuthService.currentUser` khởi tạo từ localStorage nên có uid NGAY, còn
   * Firebase khôi phục phiên từ IndexedDB chậm hơn vài trăm mili-giây. Nếu store
   * đánh dấu "đã nạp" trong khoảng đó thì kết quả 401 bị cache vĩnh viễn: người
   * dùng có sẵn tổ chức vẫn bị đá sang /onboarding, và không có đường nào thoát
   * ngoài F5.
   */
  it('chưa có token thì KHÔNG đánh dấu đã nạp, gọi lại lần hai phải nạp thật', async () => {
    // Lần gọi đầu: Firebase chưa xong → null. Lần sau: đã có token.
    const { store } = setup([null]);

    await store.ensureLoaded();

    // Luật 1 — không được coi là đã nạp.
    expect(store.loadedForUid()).toBeNull();
    expect(store.entities().length).toBe(0);
    expect(store.status()).not.toBe('loaded');
    // Và tuyệt đối không được kết luận "người này không có tổ chức nào".
    expect(store.hasNoOrg()).toBe(false);

    // Lần hai, token đã có → phải nạp thật chứ không trả lại kết quả hỏng.
    await store.ensureLoaded();

    expect(store.loadedForUid()).toBe('u1');
    expect(store.status()).toBe('loaded');
    expect(store.entities().length).toBe(2);
  });

  it('đường thành công: nạp đủ tổ chức, map đúng vai trò và sắp theo tên', async () => {
    const { store } = setup();

    await store.ensureLoaded();

    expect(store.status()).toBe('loaded');
    // Sắp theo tên chứ không theo thứ tự backend trả về.
    expect(store.organizations().map((o) => o.name)).toEqual(['Alpha', 'Zulu']);
    expect(store.lastError()).toBeNull();

    // ownerId và memberIds suy ra từ danh sách thành viên.
    const zulu = store.organizations().find((o) => o.slug === 'zulu');
    expect(zulu?.ownerId).toBe('u9');
    expect(zulu?.memberIds).toEqual(['u9', 'u1']);

    // Vai trò của TÔI trong từng tổ chức.
    expect(store.membersOf('o1').length).toBe(1);
    expect(store.orgBySlug('alpha')?.id).toBe('o1');
    expect(store.orgBySlug('khong-co')).toBeNull();
  });

  it('API hỏng: ghi lastError, xoá cờ đã nạp, và lần gọi sau vẫn thử lại được', async () => {
    const { store, api } = setup();
    api.failNext = true;

    await store.ensureLoaded();

    expect(store.status()).toBe('error');
    expect(store.lastError()).not.toBeNull();
    // Luật 2 — cờ phải được xoá, nếu không sẽ kẹt vĩnh viễn.
    expect(store.loadedForUid()).toBeNull();
    // Luật 3 — rỗng vì LỖI, không phải vì không có tổ chức nào. Guard đọc cờ này
    // để không đá người dùng sang /onboarding.
    expect(store.hasNoOrg()).toBe(false);

    // Backend sống lại → lần gọi sau phải nạp được.
    api.failNext = false;
    await store.ensureLoaded();

    expect(store.status()).toBe('loaded');
    expect(store.entities().length).toBe(2);
    expect(store.lastError()).toBeNull();
  });

  it('nạp xong mà không có tổ chức nào thì hasNoOrg mới bật', async () => {
    const { store, api } = setup();
    const goc = api.get.bind(api);
    api.get = (async (path: string) =>
      path === '/organizations' ? [] : goc(path)) as typeof api.get;

    await store.ensureLoaded();

    expect(store.status()).toBe('loaded');
    expect(store.hasNoOrg()).toBe(true);
  });

  it('lời mời từ WebSocket: thêm một lần, nhận lại cùng id thì không nhân đôi', () => {
    const { store } = setup();
    const invite = {
      id: 'i1',
      orgId: 'o1',
      orgName: 'Alpha',
      toUserId: 'u1',
      fromUserId: 'u9',
      fromUserName: 'Ai đó',
      role: 'member' as const,
      status: 'pending' as const,
      createdAt: '2026-01-01T00:00:00Z',
    };

    store.applyRemoteInvite(invite);
    store.applyRemoteInvite(invite); // hai tab cùng nhận một sự kiện

    expect(store.pendingInviteCount()).toBe(1);

    store.removeInviteLocally('i1');
    expect(store.pendingInviteCount()).toBe(0);
  });

  it('đăng ký đúng ba sự kiện tổ chức trên kênh user', async () => {
    const { realtime } = setup();
    // Việc đăng ký được hoãn một microtask để phá vòng phụ thuộc DI.
    await Promise.resolve();

    expect(realtime.registered).toContain('user:invite.created');
    expect(realtime.registered).toContain('user:invite.responded');
    expect(realtime.registered).toContain('user:member.removed');
  });
});
