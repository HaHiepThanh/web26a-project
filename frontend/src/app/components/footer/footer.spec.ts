import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Footer } from './footer';

/**
 * Footer có `routerLink`, mà RouterLink phải inject `ActivatedRoute`.
 * Không khai báo router trong TestBed thì Angular ném NG0201 ngay lúc dựng
 * component — bài test đỏ vì thiếu đồ nghề, không phải vì component sai.
 */
describe('Footer', () => {
  let component: Footer;
  let fixture: ComponentFixture<Footer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Footer],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Footer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
