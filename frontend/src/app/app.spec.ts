import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { App } from './app';

/**
 * Shell gốc của app.
 *
 * ⚠️ Bài test cũ ở đây đòi `<h1>` chứa 'Hello, frontend' — dấu vết còn sót của
 *    `ng new`. Cái h1 đó bị xoá từ lúc app.html đổi thành `<router-outlet/>` +
 *    `<app-offline-overlay/>`, nên test đỏ suốt mà không ai đọc: nó không nói
 *    lên điều gì về app này cả.
 *
 *    Thay bằng thứ shell THẬT chịu trách nhiệm: có chỗ cho router gắn trang vào,
 *    và lớp phủ mất mạng luôn hiện diện để bắt sự kiện offline ở mọi trang.
 */
describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('dung cho router-outlet va lop phu mat mang', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    // Thieu router-outlet thi moi route deu ra trang trang.
    expect(el.querySelector('router-outlet')).toBeTruthy();
    // Lop phu phai o tang shell: dat trong tung trang la mat mang o trang nao
    // chua gan thi khong bao gi.
    expect(el.querySelector('app-offline-overlay')).toBeTruthy();
  });
});
