import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { HeaderActionsService } from './header-actions.service';
import { ApiService } from './api.service';
import { BoardSearchResult } from '../models';

const MOCK_BOARDS: BoardSearchResult[] = [
  {
    id: 'b1',
    name: 'Frontend Board',
    workspaceId: 'w1',
    workspaceName: 'Engineering',
    orgId: 'org1',
    orgSlug: 'my-org',
    visibility: 'workspace',
    background: 'bg-board-blue',
  },
  {
    id: 'b2',
    name: 'Backend Board',
    workspaceId: 'w1',
    workspaceName: 'Engineering',
    orgId: 'org1',
    orgSlug: 'my-org',
    visibility: 'private',
    background: null,
  },
];

describe('HeaderActionsService — Tìm kiếm Board khi ở trang Settings & chung', () => {
  let service: HeaderActionsService;
  let api: ApiService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideRouter([])],
    });
    service = TestBed.inject(HeaderActionsService);
    api = TestBed.inject(ApiService);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('khởi tạo với trạng thái tìm kiếm mặc định', () => {
    expect(service.searchQuery()).toBe('');
    expect(service.searchResults()).toEqual([]);
    expect(service.searchLoading()).toBe(false);
    expect(service.searchDropdownOpen()).toBe(false);
  });

  it('gọi API tìm kiếm board và mở dropdown khi có từ khoá', async () => {
    vi.useFakeTimers();
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(MOCK_BOARDS);

    service.onSearchInput('Frontend');
    expect(service.searchDropdownOpen()).toBe(true);

    vi.advanceTimersByTime(250);

    expect(getSpy).toHaveBeenCalledWith(expect.stringContaining('/boards/search?q=Frontend'));
  });

  it('nhận diện trang settings và mở dropdown tìm kiếm khi focus', async () => {
    vi.spyOn(router, 'url', 'get').mockReturnValue('/settings');
    vi.spyOn(api, 'get').mockResolvedValue(MOCK_BOARDS);

    expect(service.isSettingsPage()).toBe(true);

    service.onSearchFocus();
    expect(service.searchDropdownOpen()).toBe(true);
  });

  it('bấm vào 1 board thì đóng dropdown, reset query và điều hướng tới board', () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true as any);

    service.searchDropdownOpen.set(true);
    service.searchQuery.set('Frontend');

    service.openBoard(MOCK_BOARDS[0]);

    expect(service.searchDropdownOpen()).toBe(false);
    expect(service.searchQuery()).toBe('');
    expect(navigateSpy).toHaveBeenCalledWith(['/', 'my-org', 'board', 'b1']);
  });

  it('đóng dropdown khi gọi closeSearchDropdown', () => {
    service.searchDropdownOpen.set(true);
    service.closeSearchDropdown();
    expect(service.searchDropdownOpen()).toBe(false);
  });
});
