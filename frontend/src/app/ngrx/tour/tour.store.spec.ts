import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../services/auth.service';
import { emptyOnboardingState } from '../../models';
import { TourStore } from './tour.store';

describe('TourStore', () => {
  let auth: { saveOnboardingState: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    auth = { saveOnboardingState: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: auth }],
    });
  });

  const make = () => TestBed.inject(TourStore);

  it('người chưa từng chạy thì được mời', () => {
    const store = make();
    store.hydrate(emptyOnboardingState());

    store.maybeInvite();

    expect(store.invitationOpen()).toBe(true);
  });

  it('người đã từ chối thì KHÔNG mời lại', () => {
    const store = make();
    store.hydrate({ ...emptyOnboardingState(), status: 'skipped' });

    store.maybeInvite();

    expect(store.invitationOpen()).toBe(false);
  });

  it('từ chối vẫn giữ đường quay lại: checklist còn hiện', () => {
    const store = make();
    store.hydrate(emptyOnboardingState());

    store.declineInvitation();

    expect(store.onboarding().status).toBe('skipped');
    expect(store.checklistVisible()).toBe(true);
  });

  it('bắt đầu tour thì đứng ở bước 1 và ghi trạng thái xuống DB', () => {
    const store = make();
    store.hydrate(emptyOnboardingState());

    store.start('full');

    expect(store.running()).toBe(true);
    expect(store.currentStep()?.id).toBe('create-workspace');
    expect(auth.saveOnboardingState).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'running', currentStep: 'create-workspace' }),
    );
  });

  it('có thêm workspace thì tự sang bước 2', () => {
    const store = make();
    store.hydrate(emptyOnboardingState());
    store.start('full');

    store.observe({ workspaces: 1 });

    expect(store.currentStep()?.id).toBe('create-board');
    expect(store.onboarding().completed).toEqual(['create-workspace']);
  });

  it('số lượng KHÔNG tăng thì đứng yên — bấm nút mà API lỗi không được đi tiếp', () => {
    const store = make();
    store.hydrate(emptyOnboardingState());
    store.start('full');

    store.observe({ workspaces: 0 });

    expect(store.currentStep()?.id).toBe('create-workspace');
    expect(store.onboarding().completed).toEqual([]);
  });

  it('chạy lại trên tài khoản đã có sẵn dữ liệu thì KHÔNG nhảy hết các bước', () => {
    const store = make();
    store.hydrate(emptyOnboardingState());
    // Tài khoản đã dùng lâu: 5 workspace, 3 board, 9 cột, 40 thẻ.
    store.observe({ workspaces: 5, boards: 3, lists: 9, cards: 40 });

    store.restart();

    // Mốc được chốt lúc bắt đầu, nên điều kiện là "tăng THÊM", không phải "> 0".
    expect(store.running()).toBe(true);
    expect(store.currentStep()?.id).toBe('create-workspace');

    store.observe({ workspaces: 5 });
    expect(store.currentStep()?.id).toBe('create-workspace');

    store.observe({ workspaces: 6 });
    expect(store.currentStep()?.id).toBe('create-board');
  });

  it('đi hết 4 bước thì tour đóng lại và đánh dấu done', () => {
    const store = make();
    store.hydrate(emptyOnboardingState());
    store.start('full');

    store.observe({ workspaces: 1 });
    store.observe({ boards: 1 });
    store.observe({ lists: 1 });
    store.observe({ cards: 1 });

    expect(store.running()).toBe(false);
    expect(store.onboarding().status).toBe('done');
    expect(store.completedCount()).toBe(4);
    expect(store.checklistVisible()).toBe(false);
  });

  it('bỏ dở rồi quay lại thì chạy tiếp từ bước dở, không bắt làm lại từ đầu', () => {
    const store = make();
    store.hydrate({
      ...emptyOnboardingState(),
      status: 'running',
      completed: ['create-workspace', 'create-board'],
      currentStep: 'add-list',
    });

    store.start('full');

    expect(store.currentStep()?.id).toBe('add-list');
  });

  it('đang chạy tour thì trạng thái rỗng từ server KHÔNG được ghi đè', () => {
    const store = make();
    store.hydrate(emptyOnboardingState());
    store.start('full');
    store.observe({ workspaces: 1 });
    expect(store.currentStep()?.id).toBe('create-board');

    // /auth/me trả về rỗng giữa chừng (cột chưa tạo, hoặc lần ghi trước hỏng).
    store.hydrate(emptyOnboardingState());

    expect(store.onboarding().status).toBe('running');
    expect(store.completedCount()).toBe(1);
    expect(store.currentStep()?.id).toBe('create-board');
  });

  it('server vẫn ghi đè được khi mang thông tin thật', () => {
    const store = make();
    store.hydrate(emptyOnboardingState());
    store.start('full');

    store.hydrate({ ...emptyOnboardingState(), status: 'done' });

    expect(store.onboarding().status).toBe('done');
  });

  it('Dismiss checklist KHÔNG được khai khống là đã xong cả 4 bước', () => {
    const store = make();
    store.hydrate(emptyOnboardingState());
    store.declineInvitation();
    expect(store.checklistVisible()).toBe(true);

    store.dismissChecklist();

    expect(store.checklistVisible()).toBe(false);
    // Ẩn đi, nhưng không bịa ra 4 bước đã hoàn thành.
    expect(store.completedCount()).toBe(0);
  });

  it('observe() với số liệu KHÔNG đổi thì không ghi state — chốt chặn vòng lặp vô hạn', () => {
    const store = make();
    store.hydrate(emptyOnboardingState());
    store.observe({ workspaces: 2, boards: 1 });
    const before = store.counts();

    store.observe({ workspaces: 2, boards: 1 });

    // Cùng tham chiếu = không hề patchState. Ghi ra object mới sẽ đánh thức mọi
    // effect đang đọc counts(), và đó là thứ từng khoá cứng trang workspace.
    expect(store.counts()).toBe(before);
  });

  it('observe() nhận Partial — trang board báo lists không xoá mất số workspace', () => {
    const store = make();
    store.hydrate(emptyOnboardingState());
    store.observe({ workspaces: 3 });

    store.observe({ lists: 2 });

    expect(store.counts().workspaces).toBe(3);
    expect(store.counts().lists).toBe(2);
  });
});
