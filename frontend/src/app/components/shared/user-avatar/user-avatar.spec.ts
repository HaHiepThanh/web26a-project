import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { UserAvatar } from './user-avatar';
import { AuthService } from '../../../services/auth.service';
import { User } from '../../../models';

const ME: User = { id: 'me', email: 'me@test.dev', displayName: 'Ngô Đức Hòa' };
const CU = 'https://cdn.test/moi.png';
const CU_CU = 'https://cdn.test/cu.png';

/**
 * Điểm chính cần khoá lại: ảnh của CHÍNH MÌNH đọc từ `AuthService`, không tin
 * bản chụp trong dữ liệu truyền vào — đó là thứ khiến đổi ảnh xong mọi nơi đổi
 * theo ngay mà không phải nạp lại từng store.
 */
describe('UserAvatar', () => {
  let fixture: ComponentFixture<UserAvatar>;
  let component: UserAvatar;
  let auth: AuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserAvatar],
      providers: [provideHttpClient()],
    }).compileComponents();

    auth = TestBed.inject(AuthService);
    fixture = TestBed.createComponent(UserAvatar);
    component = fixture.componentInstance;
  });

  it('lấy ảnh mới nhất từ AuthService cho chính mình, bỏ qua bản chụp cũ', () => {
    auth.currentUser.set({ ...ME, avatarUrl: CU });
    fixture.componentRef.setInput('userId', 'me');
    fixture.componentRef.setInput('avatarUrl', CU_CU); // bản chụp cũ trong store
    fixture.detectChanges();

    expect(component.resolvedUrl()).toBe(CU);
  });

  it('đổi ảnh của mình thì avatar theo ngay, không cần nạp lại dữ liệu', () => {
    auth.currentUser.set({ ...ME, avatarUrl: CU_CU });
    fixture.componentRef.setInput('userId', 'me');
    fixture.componentRef.setInput('avatarUrl', CU_CU);
    fixture.detectChanges();
    expect(component.resolvedUrl()).toBe(CU_CU);

    auth.currentUser.set({ ...ME, avatarUrl: CU });
    expect(component.resolvedUrl()).toBe(CU);
  });

  it('người khác thì dùng đúng ảnh chỗ gọi đưa vào', () => {
    auth.currentUser.set({ ...ME, avatarUrl: CU });
    fixture.componentRef.setInput('userId', 'nguoi-khac');
    fixture.componentRef.setInput('avatarUrl', CU_CU);
    fixture.detectChanges();

    expect(component.resolvedUrl()).toBe(CU_CU);
  });

  it('không có ảnh thì rơi về chữ cái đầu', () => {
    auth.currentUser.set(null);
    fixture.componentRef.setInput('userId', 'u1');
    fixture.componentRef.setInput('name', 'Ngô Đức Hòa');
    fixture.detectChanges();

    expect(component.showImage()).toBe(false);
    expect(component.initials()).toBe('NH');
  });

  it('ảnh hỏng thì tắt ĐÚNG link đó, ảnh mới vẫn hiện lại', () => {
    auth.currentUser.set({ ...ME, avatarUrl: CU_CU });
    fixture.componentRef.setInput('userId', 'me');
    fixture.detectChanges();
    expect(component.showImage()).toBe(true);

    component.onError(); // link cũ tải hỏng → rơi về chữ cái đầu
    expect(component.showImage()).toBe(false);

    // Người dùng tải ảnh MỚI lên: đây là link khác nên phải thử lại, không được
    // tắt vĩnh viễn như cờ boolean ở bản Header cũ.
    auth.currentUser.set({ ...ME, avatarUrl: CU });
    expect(component.showImage()).toBe(true);
  });
});
