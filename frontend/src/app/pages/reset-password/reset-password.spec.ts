import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResetPassword } from './reset-password';
import { AuthService } from '../../services/auth.service';

/**
 * Trang này là **action handler** của Firebase: một khi Action URL trong Console
 * đã trỏ về `/auth/action`, nó nhận MỌI loại liên kết chứ không riêng đặt lại
 * mật khẩu. Những bài dưới đây canh đúng chỗ đó.
 */
function dung(params: Record<string, string>) {
  const auth = {
    verifyResetCode: vi.fn<(c: string) => Promise<string>>().mockResolvedValue('an@x.com'),
    applyActionCode: vi.fn<(c: string) => Promise<void>>().mockResolvedValue(undefined),
    confirmReset: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: new Map(Object.entries(params)) } },
      },
    ],
  });
  // `queryParamMap` thật có `.get()`; Map cũng có, nên dùng thẳng được.
  const fixture = TestBed.createComponent(ResetPassword);
  return { comp: fixture.componentInstance, auth, fixture };
}

describe('ResetPassword — phân nhánh theo mode', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('thiếu mode thì coi là đặt lại mật khẩu (route /reset-password cũ vẫn chạy)', async () => {
    const { comp, auth } = dung({ oobCode: 'abc' });
    comp.ngOnInit();
    await Promise.resolve();
    expect(comp.mode()).toBe('resetPassword');
    expect(auth.verifyResetCode).toHaveBeenCalledWith('abc');
    expect(auth.applyActionCode).not.toHaveBeenCalled();
  });

  it('mode=resetPassword → xác minh mã rồi hiện biểu mẫu', async () => {
    const { comp, auth } = dung({ mode: 'resetPassword', oobCode: 'abc' });
    comp.ngOnInit();
    await Promise.resolve();
    await Promise.resolve();
    expect(auth.verifyResetCode).toHaveBeenCalled();
    expect(comp.validCode()).toBe(true);
    expect(comp.success()).toBe(false); // chưa xong, còn phải nhập mật khẩu
  });

  it('mode=verifyEmail → áp mã LUÔN, KHÔNG hỏi mật khẩu', async () => {
    // Không phân nhánh thì trang cố "đặt lại mật khẩu" cho một mã verifyEmail
    // và báo một lỗi chẳng liên quan gì.
    const { comp, auth } = dung({ mode: 'verifyEmail', oobCode: 'xyz' });
    comp.ngOnInit();
    await Promise.resolve();
    await Promise.resolve();
    expect(auth.applyActionCode).toHaveBeenCalledWith('xyz');
    expect(auth.verifyResetCode).not.toHaveBeenCalled();
    expect(comp.success()).toBe(true);
    expect(comp.tieuDeThanhCong()).toContain('verified');
  });

  it('mode=recoverEmail → áp mã và khuyên đổi mật khẩu', async () => {
    const { comp, auth } = dung({ mode: 'recoverEmail', oobCode: 'r1' });
    comp.ngOnInit();
    await Promise.resolve();
    await Promise.resolve();
    expect(auth.applyActionCode).toHaveBeenCalledWith('r1');
    expect(comp.tieuDeThanhCong()).toContain('restored');
    expect(comp.moTaThanhCong()).toContain('resetting your password');
  });

  it('mode lạ → báo rõ, KHÔNG im lặng làm sai', async () => {
    const { comp, auth } = dung({ mode: 'signIn', oobCode: 'q' });
    comp.ngOnInit();
    await Promise.resolve();
    await Promise.resolve();
    expect(comp.mode()).toBe('khac');
    expect(auth.applyActionCode).not.toHaveBeenCalled();
    expect(comp.validCode()).toBe(false);
    expect(comp.verifyError()).toContain('not handled here');
  });

  it('thiếu oobCode → báo lỗi, không gọi Firebase', async () => {
    const { comp, auth } = dung({ mode: 'verifyEmail' });
    comp.ngOnInit();
    await Promise.resolve();
    expect(auth.applyActionCode).not.toHaveBeenCalled();
    expect(comp.verifyError()).toContain('No reset code');
  });

  it('mã hết hạn ở verifyEmail vẫn ra câu dễ hiểu', async () => {
    const { comp, auth } = dung({ mode: 'verifyEmail', oobCode: 'het-han' });
    auth.applyActionCode.mockRejectedValue({ code: 'auth/expired-action-code' });
    comp.ngOnInit();
    await Promise.resolve();
    await Promise.resolve();
    expect(comp.verifyError()).toContain('expired');
  });

  it('nhận cả tham số `code` thay cho `oobCode`', async () => {
    const { comp, auth } = dung({ mode: 'verifyEmail', code: 'alt' });
    comp.ngOnInit();
    await Promise.resolve();
    await Promise.resolve();
    expect(auth.applyActionCode).toHaveBeenCalledWith('alt');
  });
});
