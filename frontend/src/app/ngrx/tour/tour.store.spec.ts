import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../services/auth.service';
import { emptyOnboardingState } from '../../models';
import { RouteContextStore } from '../route-context/route-context.store';
import { TourSeedService } from './tour.seed';
import { TourStore } from './tour.store';

describe('TourStore', () => {
  let auth: { saveOnboardingState: ReturnType<typeof vi.fn> };
  let seeder: { seed: ReturnType<typeof vi.fn>; cleanup: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    auth = { saveOnboardingState: vi.fn().mockResolvedValue(undefined) };
    seeder = {
      seed: vi.fn().mockResolvedValue({ listIds: ['l1'], cardIds: ['c1', 'c2'] }),
      cleanup: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: TourSeedService, useValue: seeder },
        // Tour tầng 2 gieo vào board đang mở; store chỉ cần biết id.
        { provide: RouteContextStore, useValue: { activeBoardId: () => 'board-1' } },
      ],
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
    store.observe({ workspaces: 0, boards: 0, lists: 0, cards: 0 });
    store.start('full');

    store.observe({ workspaces: 1 });

    expect(store.currentStep()?.id).toBe('create-board');
    expect(store.onboarding().completed).toEqual(['create-workspace']);
  });

  it('số lượng KHÔNG tăng thì đứng yên — bấm nút mà API lỗi không được đi tiếp', () => {
    const store = make();
    store.hydrate(emptyOnboardingState());
    store.observe({ workspaces: 0, boards: 0, lists: 0, cards: 0 });
    store.start('full');

    store.observe({ workspaces: 0 });

    expect(store.currentStep()?.id).toBe('create-workspace');
    expect(store.onboarding().completed).toEqual([]);
  });

  it('"Restart tutorial" từ trang Cài đặt KHÔNG được nhảy qua bước nào', () => {
    const store = make();
    store.hydrate(emptyOnboardingState());

    // Trang Cài đặt không báo số lượng, và vừa tải lại app nên counts còn là 0.
    // Chốt mốc lúc này là chốt bằng 0 — không đáng tin.
    store.restart();
    expect(store.currentStep()?.id).toBe('create-workspace');

    // Về tới trang workspace, trang báo tài khoản vốn đã có 2 workspace, 3 board.
    // Đây là DỰNG LẠI MỐC, không phải người dùng vừa tạo ra chúng.
    store.observe({ workspaces: 2, boards: 3 });
    expect(store.currentStep()?.id).toBe('create-workspace');
    expect(store.completedCount()).toBe(0);

    // Chỉ khi tạo thêm thật mới được đi tiếp.
    store.observe({ workspaces: 3 });
    expect(store.currentStep()?.id).toBe('create-board');
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

  /** Chạy hết tầng 1 ở chế độ đã cho. */
  const chayHetTang1 = (store: ReturnType<typeof make>, mode: 'full' | 'basics') => {
    store.hydrate(emptyOnboardingState());
    store.observe({ workspaces: 0, boards: 0, lists: 0, cards: 0 });
    store.start(mode);
    store.observe({ workspaces: 1 });
    store.observe({ boards: 1 });
    store.observe({ lists: 1 });
    store.observe({ cards: 1 });
  };

  it('"Just the basics" dừng hẳn sau bước 4', () => {
    const store = make();
    chayHetTang1(store, 'basics');

    expect(store.running()).toBe(false);
    expect(store.onboarding().status).toBe('done');
    expect(store.completedCount()).toBe(4);
    expect(store.seedOfferOpen()).toBe(false);
    expect(store.checklistVisible()).toBe(false);
  });

  it('"Just the basics" đếm tổng số bước là 4, không phải 7', () => {
    const store = make();
    store.hydrate(emptyOnboardingState());
    store.observe({ workspaces: 0, boards: 0, lists: 0, cards: 0 });
    store.start('basics');
    expect(store.totalSteps()).toBe(4);

    store.start('full');
    expect(store.totalSteps()).toBe(7);
  });

  it('chế độ đầy đủ: hết bước 4 thì HỎI gieo dữ liệu, không nhảy thẳng sang bước 5', () => {
    const store = make();
    chayHetTang1(store, 'full');

    // Dạy bộ lọc trên board một thẻ là vô nghĩa — phải có dữ liệu trước.
    expect(store.seedOfferOpen()).toBe(true);
    expect(store.running()).toBe(false);
    expect(store.completedCount()).toBe(4);
  });

  it('đồng ý gieo: gọi API thật, sang bước 5, và nhớ id để dọn sau', async () => {
    const store = make();
    chayHetTang1(store, 'full');

    await store.acceptSeed();

    expect(seeder.seed).toHaveBeenCalledWith('board-1');
    expect(store.running()).toBe(true);
    expect(store.currentStep()?.id).toBe('use-filter');
    expect(store.onboarding().seeded).toEqual({ listIds: ['l1'], cardIds: ['c1', 'c2'] });
  });

  it('số cột của board CŨ không được làm mốc cho board mới', () => {
    const store = make();
    store.hydrate(emptyOnboardingState());
    // Người dùng ghé một board có sẵn 3 cột trước khi bắt đầu tour.
    store.observe({ workspaces: 1, boards: 1, lists: 3, cards: 12 });
    store.start('full');
    store.observe({ workspaces: 2 });
    store.observe({ boards: 2 });
    expect(store.currentStep()?.id).toBe('add-list');

    // Mở board MỚI vừa tạo — trang Board quên số của board cũ đi.
    store.resetBoardCounts();
    store.observe({ lists: 0, cards: 0 });

    // Thêm đúng MỘT cột là xong bước 3. Không có resetBoardCounts thì mốc vẫn
    // là 3, và người dùng phải thêm tới cột thứ tư mới thoát được bước này.
    store.observe({ lists: 1 });
    expect(store.currentStep()?.id).toBe('add-card');
  });

  it('mở một board đã có sẵn cột và thẻ KHÔNG được tính là làm xong bước 3 và 4', () => {
    const store = make();
    store.hydrate(emptyOnboardingState());
    // Trang workspace chỉ báo hai loại số của nó. `lists`/`cards` chưa ai báo.
    store.observe({ workspaces: 2, boards: 3 });
    store.start('full');
    store.observe({ workspaces: 3 });
    store.observe({ boards: 4 });
    expect(store.currentStep()?.id).toBe('add-list');

    // Mở một board CŨ, sẵn 3 cột 8 thẻ. Đây là lần đầu hai loại số này được báo
    // — dựng mốc, không phải thành tích của người dùng.
    store.observe({ lists: 3, cards: 8 });

    expect(store.currentStep()?.id).toBe('add-list');
    expect(store.seedOfferOpen()).toBe(false);

    // Thêm cột thật thì mới đi tiếp.
    store.observe({ lists: 4 });
    expect(store.currentStep()?.id).toBe('add-card');
  });

  it('bỏ qua bước tạo thẻ thì KHÔNG gieo thẻ mẫu — người dùng phải tự làm trước', () => {
    const store = make();
    store.hydrate(emptyOnboardingState());
    store.observe({ workspaces: 0, boards: 0, lists: 0, cards: 0 });
    store.start('full');
    store.skipStep();
    store.skipStep();
    store.skipStep();
    expect(store.currentStep()?.id).toBe('add-card');

    store.skipStep();

    // Đổ 8 thẻ mẫu vào board của người chưa hề tự tạo thẻ nào là lấy mất đúng
    // cái khoảnh khắc mà cả tầng 1 tồn tại để tạo ra.
    expect(store.seedOfferOpen()).toBe(false);
    expect(store.running()).toBe(false);
    expect(store.onboarding().status).toBe('skipped');
  });

  it('tải lại trang đúng lúc hộp gieo đang mở thì lần sau hỏi lại, không rơi vào tầng 2', () => {
    const store = make();
    // Trạng thái đọc từ DB: đã xong tầng 1, đang ở bước 5, nhưng CHƯA gieo gì.
    store.hydrate({
      ...emptyOnboardingState(),
      status: 'running',
      completed: ['create-workspace', 'create-board', 'add-list', 'add-card'],
      currentStep: 'use-filter',
      seeded: null,
    });
    store.observe({ workspaces: 1, boards: 1, lists: 1, cards: 1 });

    store.start('full');

    expect(store.seedOfferOpen()).toBe(true);
    expect(store.running()).toBe(false);
  });

  it('tự tạo thẻ xong rồi bỏ qua thì VẪN được mời gieo', () => {
    const store = make();
    store.hydrate(emptyOnboardingState());
    store.observe({ workspaces: 0, boards: 0, lists: 0, cards: 0 });
    store.start('full');
    store.observe({ workspaces: 1 });
    store.observe({ boards: 1 });
    store.observe({ lists: 1 });
    store.observe({ cards: 1 });

    expect(store.onboarding().completed).toContain('add-card');
    expect(store.seedOfferOpen()).toBe(true);
  });

  it('từ chối gieo: kết thúc tour, KHÔNG cố dẫn tiếp tầng 2 trên board trống', () => {
    const store = make();
    chayHetTang1(store, 'full');

    store.declineSeed();

    expect(store.seedOfferOpen()).toBe(false);
    expect(store.running()).toBe(false);
    expect(store.onboarding().status).toBe('done');
  });

  it('tầng 2 KHÔNG tự nhảy khi người dùng vừa mở bảng lọc ra', async () => {
    const store = make();
    chayHetTang1(store, 'full');
    await store.acceptSeed();
    expect(store.currentStep()?.id).toBe('use-filter');

    // Mở bảng lọc mới chỉ là mở ra. Bài học nằm ở chỗ chọn "High" rồi nhìn badge
    // nhảy 3/8 — nhảy bước ngay lúc này là cướp mất đúng khoảnh khắc đó.
    store.observeFlags({ filterOpen: true });

    expect(store.currentStep()?.id).toBe('use-filter');
    expect(store.needsAck()).toBe(true);
  });

  it('tầng 2 đi tiếp khi người dùng tự bấm Next', async () => {
    const store = make();
    chayHetTang1(store, 'full');
    await store.acceptSeed();

    store.acknowledgeStep();
    expect(store.currentStep()?.id).toBe('open-chat');

    store.acknowledgeStep();
    expect(store.currentStep()?.id).toBe('try-ai');
  });

  it('mọi bước tầng 2 đều chờ người dùng bấm Next, kể cả khi việc đó đã làm rồi', async () => {
    const store = make();
    chayHetTang1(store, 'full');
    await store.acceptSeed();

    // Khung chat vốn đã mở sẵn từ phiên trước (localStorage nhớ trạng thái đó).
    // Trước đây tour coi là xong và lặng lẽ bỏ qua — người dùng không bao giờ
    // biết app có khung chat, chỉ thấy màn hình tự nhảy.
    store.observeFlags({ filterOpen: true, chatOpen: true });
    expect(store.currentStep()?.id).toBe('use-filter');

    store.acknowledgeStep();
    expect(store.currentStep()?.id).toBe('open-chat');
    expect(store.needsAck()).toBe(true);

    store.acknowledgeStep();
    expect(store.currentStep()?.id).toBe('try-ai');
  });


  it('xong bước cuối thì hỏi dọn thẻ mẫu', async () => {
    const store = make();
    chayHetTang1(store, 'full');
    await store.acceptSeed();
    store.acknowledgeStep();
    store.acknowledgeStep();
    store.acknowledgeStep();

    expect(store.running()).toBe(false);
    expect(store.onboarding().status).toBe('done');
    expect(store.completedCount()).toBe(7);
    expect(store.cleanupOfferOpen()).toBe(true);
  });

  it('bước AI không hiện được thì tour vẫn tính là XONG, và vẫn hỏi dọn thẻ mẫu', async () => {
    const store = make();
    chayHetTang1(store, 'full');
    await store.acceptSeed();
    store.acknowledgeStep();
    store.acknowledgeStep();
    expect(store.currentStep()?.id).toBe('try-ai');

    // Gemini không được cấu hình (thiếu GEMINI_API_KEY) → chip gợi ý không bao
    // giờ xuất hiện → lớp phủ hết giờ chờ neo và gọi skipStep().
    store.skipStep();

    expect(store.onboarding().status).toBe('done');
    expect(store.running()).toBe(false);
    // Và quan trọng nhất: vẫn phải hỏi dọn, kẻo 8 thẻ mẫu nằm lại board mãi.
    expect(store.cleanupOfferOpen()).toBe(true);
  });

  it('bỏ qua một bước BẮT BUỘC ở cuối thì vẫn là skipped', () => {
    const store = make();
    store.hydrate(emptyOnboardingState());
    store.observe({ workspaces: 0, boards: 0, lists: 0, cards: 0 });
    store.start('basics');
    store.skipStep();
    store.skipStep();
    store.skipStep();
    store.skipStep();

    expect(store.onboarding().status).toBe('skipped');
  });

  it('dọn thẻ mẫu chỉ xoá đúng những gì mình gieo', async () => {
    const store = make();
    chayHetTang1(store, 'full');
    await store.acceptSeed();
    store.acknowledgeStep();
    store.acknowledgeStep();
    store.acknowledgeStep();

    await store.acceptCleanup();

    expect(seeder.cleanup).toHaveBeenCalledWith({ listIds: ['l1'], cardIds: ['c1', 'c2'] });
    expect(store.onboarding().seeded).toBeNull();
  });

  it('giữ lại thẻ mẫu thì quên id đi — lần tour sau không đòi xoá thứ họ đã cố ý giữ', async () => {
    const store = make();
    chayHetTang1(store, 'full');
    await store.acceptSeed();
    store.acknowledgeStep();
    store.acknowledgeStep();
    store.acknowledgeStep();

    store.declineCleanup();

    expect(seeder.cleanup).not.toHaveBeenCalled();
    expect(store.onboarding().seeded).toBeNull();
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
    store.observe({ workspaces: 0, boards: 0, lists: 0, cards: 0 });
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
    store.observe({ workspaces: 0, boards: 0, lists: 0, cards: 0 });
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
