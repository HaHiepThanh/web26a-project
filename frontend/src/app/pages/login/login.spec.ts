import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { Login } from './login';

/**
 * Login đọc queryParam (returnUrl) và có routerLink sang trang đăng ký.
 *
 * `provideRouter` cho RouterLink/ActivatedRoute; `provideHttpClient` cho các
 * store dùng ApiService — chúng khởi tạo ngay lúc component được dựng.
 * Không có hai thứ này thì test đỏ vì thiếu đồ nghề, không phải vì code sai.
 */
describe('Login', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
