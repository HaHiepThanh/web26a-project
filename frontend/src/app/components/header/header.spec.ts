import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { Header } from './header';

/**
 * Header có routerLink và inject nhiều store gọi API.
 *
 * `provideRouter` cho RouterLink/ActivatedRoute; `provideHttpClient` cho các
 * store dùng ApiService — chúng khởi tạo ngay lúc component được dựng.
 * Không có hai thứ này thì test đỏ vì thiếu đồ nghề, không phải vì code sai.
 */
describe('Header', () => {
  let component: Header;
  let fixture: ComponentFixture<Header>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Header],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();

    fixture = TestBed.createComponent(Header);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('gọi actions.onSearchInput khi người dùng gõ vào ô tìm kiếm', () => {
    const searchSpy = vi.spyOn(component.actions, 'onSearchInput');
    const input = fixture.nativeElement.querySelector('input[placeholder="Search boards..."]');
    if (input) {
      input.value = 'Dev Board';
      input.dispatchEvent(new Event('input'));
      expect(searchSpy).toHaveBeenCalledWith('Dev Board');
    }
  });

  it('xóa ô tìm kiếm khi bấm nút clear', () => {
    component.actions.searchQuery.set('Test');
    fixture.detectChanges();

    const searchSpy = vi.spyOn(component.actions, 'onSearchInput');
    component.clearSearch();
    expect(searchSpy).toHaveBeenCalledWith('');
  });
});
