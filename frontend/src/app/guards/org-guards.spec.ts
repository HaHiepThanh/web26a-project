import { HttpErrorResponse } from '@angular/common/http';
import { signal, runInInjectionContext, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { provideRouter } from '@angular/router';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { FirebaseService } from '../services/firebase.service';
import { RealtimeService } from '../services/realtime.service';
import { onboardingGuard } from './onboarding.guard';
import { orgSlugGuard } from './org-slug.guard';

/**
 * Guard là nơi hậu quả của "rỗng vì lỗi" hiện ra rõ nhất.
 *
 * Người dùng có sẵn ba tổ chức, backend chết một nhịp, danh sách về rỗng — nếu
 * guard coi đó là "chưa có tổ chức nào" thì họ bị đá sang /onboarding và tưởng
 * mất sạch dữ liệu, rồi đi tạo thêm một tổ chức thừa. Đây chính là bug mục 4
 * tài liệu mô tả, và ba bài test dưới đây khoá nó lại.
 */

class FakeApi {
  fail = false;
  orgs: unknown[] = [{ id: 'o1', name: 'Alpha', slug: 'alpha', role: 'owner' }];

  async get<T>(path: string): Promise<T> {
    if (this.fail) throw new HttpErrorResponse({ status: 0, statusText: 'Unknown Error' });
    if (path === '/organizations') return this.orgs as unknown as T;
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

function setup(dangNhap = true) {
  const api = new FakeApi();

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ApiService, useValue: api },
      { provide: FirebaseService, useValue: { getIdToken: async () => 'token' } },
      {
        provide: RealtimeService,
        useValue: { onBoardEvent: () => () => undefined, onUserEvent: () => () => undefined },
      },
      {
        provide: AuthService,
        useValue: { currentUser: signal(dangNhap ? { id: 'u1' } : null) },
      },
    ],
  });

  return { api, injector: TestBed.inject(Injector), router: TestBed.inject(Router) };
}

/** Chạy guard trong injection context và ép kiểu kết quả về dạng dễ kiểm tra. */
async function chay(
  injector: Injector,
  guard: typeof onboardingGuard,
  slug?: string,
): Promise<true | UrlTree> {
  const route = {
    paramMap: { get: (k: string) => (k === 'orgSlug' ? (slug ?? null) : null) },
  } as unknown as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;

  const kq = await runInInjectionContext(injector, () => guard(route, state));
  return kq as true | UrlTree;
}

describe('onboardingGuard', () => {
  it('có tổ chức → cho vào app', async () => {
    const { injector } = setup();

    expect(await chay(injector, onboardingGuard)).toBe(true);
  });

  it('⭐ backend chết → CHO VÀO app, tuyệt đối không đá sang /onboarding', async () => {
    const { injector, api } = setup();
    api.fail = true;

    const kq = await chay(injector, onboardingGuard);

    // Rỗng vì LỖI. Đá sang /onboarding ở đây là nói với người dùng rằng dữ liệu
    // của họ không tồn tại — họ sẽ đi tạo tổ chức thừa.
    expect(kq).toBe(true);
  });

  it('nạp xong mà thật sự chưa có tổ chức nào → /onboarding', async () => {
    const { injector, api } = setup();
    api.orgs = [];

    const kq = await chay(injector, onboardingGuard);

    expect(kq).toBeInstanceOf(UrlTree);
    expect(String(kq)).toContain('/onboarding');
  });

  it('chưa đăng nhập → /login', async () => {
    const { injector } = setup(false);

    const kq = await chay(injector, onboardingGuard);

    expect(String(kq)).toContain('/login');
  });
});

describe('orgSlugGuard', () => {
  it('slug đúng → cho vào', async () => {
    const { injector } = setup();

    expect(await chay(injector, orgSlugGuard, 'alpha')).toBe(true);
  });

  it('slug không thuộc về mình → /not-found', async () => {
    const { injector } = setup();

    const kq = await chay(injector, orgSlugGuard, 'cong-ty-nguoi-khac');

    // Gộp "không tồn tại" và "không có quyền" làm một là CỐ Ý: phân biệt hai
    // cái là vô tình xác nhận tổ chức đó có thật cho người ngoài.
    expect(String(kq)).toContain('/not-found');
  });

  it('⭐ backend chết → CHO VÀO app, không trả 404', async () => {
    const { injector, api } = setup();
    api.fail = true;

    const kq = await chay(injector, orgSlugGuard, 'alpha');

    // Lúc này ta có mảng rỗng vì lỗi mạng, chứ không phải vì slug sai. Trả 404
    // là nói dối người dùng.
    expect(kq).toBe(true);
  });
});
