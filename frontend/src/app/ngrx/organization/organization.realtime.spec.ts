import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { FirebaseService } from '../../services/firebase.service';
import { RealtimeService } from '../../services/realtime.service';
import type { UserEvent } from '../../models';
import { OrganizationStore } from './organization.store';

/**
 * Handler WebSocket chạy THẬT, không chỉ kiểm tra "đã đăng ký".
 *
 * Vòng test trước mới xác nhận store có gọi `onUserEvent` cho ba loại sự kiện.
 * Nhưng phần dễ sai nhất là đoạn map payload thành `OrgInvite` — nó được chép
 * tay từ `realtime.service.ts` sang, sót một trường thì chuông thông báo hiện
 * dòng trống mà không ai biết vì sao.
 */

/** RealtimeService giả có thể "bắn" sự kiện xuống đúng handler đã đăng ký. */
class FakeRealtime {
  private readonly userHandlers = new Map<string, (data: unknown, e: UserEvent) => void>();

  onBoardEvent(): () => void {
    return () => undefined;
  }

  onUserEvent(type: string, handler: (data: never, e: UserEvent) => void): () => void {
    this.userHandlers.set(type, handler as (d: unknown, e: UserEvent) => void);
    return () => this.userHandlers.delete(type);
  }

  /** Giả lập server đẩy một sự kiện xuống. */
  emitUser(type: string, data: unknown, actorId = 'u9'): void {
    const handler = this.userHandlers.get(type);
    if (!handler) throw new Error('Chưa ai đăng ký sự kiện "' + type + '"');
    handler(data, { type, actorId, data } as unknown as UserEvent);
  }

  has(type: string): boolean {
    return this.userHandlers.has(type);
  }
}

class FakeApi {
  reloads = 0;
  async get<T>(path: string): Promise<T> {
    if (path === '/organizations') {
      this.reloads++;
      return [] as unknown as T;
    }
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

async function setup() {
  const api = new FakeApi();
  const realtime = new FakeRealtime();

  TestBed.configureTestingModule({
    providers: [
      { provide: ApiService, useValue: api },
      { provide: FirebaseService, useValue: { getIdToken: async () => 'token' } },
      { provide: RealtimeService, useValue: realtime },
      { provide: AuthService, useValue: { currentUser: signal({ id: 'u1' }) } },
    ],
  });

  const store = TestBed.inject(OrganizationStore);
  // Đăng ký handler bị hoãn một microtask để phá vòng phụ thuộc DI.
  await Promise.resolve();
  return { store, api, realtime };
}

describe('OrganizationStore — sự kiện WebSocket', () => {
  it('invite.created: dựng đủ trường OrgInvite từ payload của server', async () => {
    const { store, realtime } = await setup();

    realtime.emitUser(
      'invite.created',
      {
        id: 'i1',
        orgId: 'o7',
        orgName: 'Công ty ABC',
        role: 'admin',
        fromUser: { displayName: 'Nam', email: 'nam@test.dev' },
        createdAt: '2026-02-01T10:00:00Z',
      },
      'u9',
    );

    expect(store.pendingInviteCount()).toBe(1);
    // Chuông cần hiện "Nam mời bạn vào Công ty ABC" — thiếu trường nào là hiện
    // chuỗi rỗng hoặc uid trần.
    expect(store.myInvites()[0]).toEqual({
      id: 'i1',
      orgId: 'o7',
      orgName: 'Công ty ABC',
      toUserId: '',
      fromUserId: 'u9',
      fromUserName: 'Nam',
      role: 'admin',
      status: 'pending',
      createdAt: '2026-02-01T10:00:00Z',
    });
  });

  it('invite.created: không có displayName thì lấy email làm tên hiển thị', async () => {
    const { store, realtime } = await setup();

    realtime.emitUser('invite.created', {
      id: 'i2',
      orgId: 'o7',
      orgName: 'ABC',
      role: 'member',
      fromUser: { displayName: null, email: 'nam@test.dev' },
      createdAt: '2026-02-01T10:00:00Z',
    });

    expect(store.myInvites()[0].fromUserName).toBe('nam@test.dev');
  });

  it('invite.created: thiếu cả hai thì vẫn có tên đọc được, không để trống', async () => {
    const { store, realtime } = await setup();

    realtime.emitUser('invite.created', {
      id: 'i3',
      orgId: 'o7',
      orgName: 'ABC',
      role: 'member',
      fromUser: { displayName: null, email: '' },
      createdAt: '2026-02-01T10:00:00Z',
    });

    expect(store.myInvites()[0].fromUserName).toBe('Ai đó');
  });

  it('invite.created: thiếu role thì mặc định member', async () => {
    const { store, realtime } = await setup();

    realtime.emitUser('invite.created', {
      id: 'i4',
      orgId: 'o7',
      orgName: 'ABC',
      fromUser: { displayName: 'Nam', email: 'nam@test.dev' },
      createdAt: '2026-02-01T10:00:00Z',
    });

    expect(store.myInvites()[0].role).toBe('member');
  });

  it('invite.responded: gỡ khỏi chuông và nạp lại danh sách', async () => {
    const { store, api, realtime } = await setup();

    realtime.emitUser('invite.created', {
      id: 'i1',
      orgId: 'o7',
      orgName: 'ABC',
      role: 'member',
      fromUser: { displayName: 'Nam', email: 'nam@test.dev' },
      createdAt: '2026-02-01T10:00:00Z',
    });
    expect(store.pendingInviteCount()).toBe(1);

    const truoc = api.reloads;
    realtime.emitUser('invite.responded', { id: 'i1' });
    await Promise.resolve();

    expect(store.pendingInviteCount()).toBe(0);
    // Người gửi lời mời cần thấy thành viên mới xuất hiện trong tổ chức.
    expect(api.reloads).toBeGreaterThan(truoc);
  });

  it('member.removed: nạp lại để tổ chức biến mất khỏi bộ chuyển', async () => {
    const { api, realtime } = await setup();

    const truoc = api.reloads;
    realtime.emitUser('member.removed', { orgId: 'o7', userId: 'u1' });
    await Promise.resolve();

    expect(api.reloads).toBeGreaterThan(truoc);
  });

  it('KHÔNG đăng ký card.assigned — đó là việc của NotificationStore', async () => {
    const { realtime } = await setup();

    // Đăng ký nhầm là thông báo giao thẻ bị xử lý hai lần khi NotificationStore
    // ra đời.
    expect(realtime.has('card.assigned')).toBe(false);
  });
});
