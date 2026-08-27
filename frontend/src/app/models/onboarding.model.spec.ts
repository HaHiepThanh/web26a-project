import { describe, it, expect } from 'vitest';
import { parseOnboardingState } from './onboarding.model';

/**
 * Bước 'try-ai' đã gộp vào 'open-chat'. Nhưng id cũ vẫn nằm trong cột
 * `users.onboarding_state jsonb` của mọi người từng chạy tour trước lần đổi này
 * — và `jsonb` thì database không kiểm hộ, nên chỉ có hàm đọc mới chặn được.
 */
describe('parseOnboardingState — id bước cũ sau khi gộp bước', () => {
  it('người đang DỞ ở bước try-ai không bị lôi về bước 1', () => {
    // Đây là cái giá phải trả nếu quên dịch id: `currentStep` thành rác, bị ném
    // đi, rơi về null, rồi tour thấy status 'running' mà không biết dở ở đâu nên
    // quay về bước đầu tiên. Người dùng làm gần xong tour bị bắt làm lại từ đầu
    // chỉ vì ta đổi tên một bước.
    const s = parseOnboardingState({
      status: 'running',
      currentStep: 'try-ai',
      completed: ['create-workspace', 'create-board', 'add-list', 'add-card', 'use-filter'],
    });

    expect(s.currentStep).toBe('open-chat');
    expect(s.status).toBe('running');
  });

  it('try-ai trong danh sách đã xong được dịch sang open-chat', () => {
    const s = parseOnboardingState({ status: 'done', completed: ['use-filter', 'try-ai'] });

    expect(s.completed).toEqual(['use-filter', 'open-chat']);
  });

  it('có CẢ try-ai lẫn open-chat thì chỉ tính một lần', () => {
    // Hai id cũ cùng dịch về một id mới. Không khử trùng thì thanh checklist
    // cộng ra "8/7" — một con số không tồn tại.
    const s = parseOnboardingState({
      status: 'done',
      completed: ['create-workspace', 'open-chat', 'try-ai'],
    });

    expect(s.completed).toEqual(['create-workspace', 'open-chat']);
  });

  it('id không nhận ra vẫn bị ném đi như cũ', () => {
    // Luật cũ không được nới lỏng: rác do ai đó sửa tay trong Supabase vẫn phải
    // bị loại, nếu không `TOUR_STEPS` sẽ tra ra undefined ngay lần render đầu.
    const s = parseOnboardingState({
      status: 'running',
      currentStep: 'khong-co-buoc-nay',
      completed: ['add-card', 'cai-gi-day'],
    });

    expect(s.completed).toEqual(['add-card']);
    // 'running' mà không biết dở ở đâu → quay về bước đầu, đúng hành vi cũ.
    expect(s.currentStep).toBe('create-workspace');
  });

  it('bước mới meet-calendar được giữ nguyên', () => {
    const s = parseOnboardingState({ status: 'running', currentStep: 'meet-calendar' });

    expect(s.currentStep).toBe('meet-calendar');
  });
});
