import { describe, it, expect } from 'vitest';
import { moTaSoLuong, SuKienNhap } from './ics.util';

const sk = (over: Partial<SuKienNhap> = {}): SuKienNhap => ({
  uid: 'u-1', title: 'Họp', description: null, location: null,
  startAt: '2026-01-01T09:00:00.000Z', endAt: '2026-01-01T10:00:00.000Z',
  allDay: false, timeZone: null, remindMinutes: null, attendeeEmails: [],
  quyTac: null, laLanLap: false, canhBao: [],
  ...over,
});

describe('moTaSoLuong', () => {
  it('một sự kiện lẻ thì không nói gì thêm', () => {
    expect(moTaSoLuong([sk()])).toBe('');
  });

  it('MỘT chuỗi lặp trải ra nhiều lần → nói quy tắc đã nạp, không doạ mất buổi', () => {
    // Đây là ca gây hiểu nhầm cũ: 36 phần tử nhưng chỉ là MỘT sự kiện lặp,
    // quy tắc đã nạp nên tạo một lần là có đủ chuỗi — không mất gì cả.
    const ds = Array.from({ length: 36 }, () =>
      sk({ quyTac: { freq: 'DAILY' }, laLanLap: true }),
    );
    const ra = moTaSoLuong(ds);
    expect(ra).toContain('one recurring event (36 occurrences)');
    expect(ra).toContain('repeat rule is loaded');
    expect(ra).not.toContain('only the first');
  });

  it('NHIỀU sự kiện khác nhau → nói thẳng là phần còn lại chưa vào', () => {
    const ds = [sk({ uid: 'a' }), sk({ uid: 'b' }), sk({ uid: 'c' })];
    const ra = moTaSoLuong(ds);
    expect(ra).toContain('3 different events');
    expect(ra).toContain('only the first is loaded');
  });

  it('KHÔNG khuyên chỉnh khoảng ngày — ô đó đã bị gỡ khỏi giao diện', () => {
    const ds = [sk({ uid: 'a' }), sk({ uid: 'b' })];
    expect(moTaSoLuong(ds).toLowerCase()).not.toContain('date range');
  });

  it('thiếu uid thì rơi về tiêu đề để đếm', () => {
    const ds = [sk({ uid: null, title: 'A' }), sk({ uid: null, title: 'B' })];
    expect(moTaSoLuong(ds)).toContain('2 different events');
  });

  it('danh sách rỗng thì im', () => {
    expect(moTaSoLuong([])).toBe('');
  });
});

// Phần đối chiếu với file .ics THẬT (~/Downloads) cố ý KHÔNG để ở đây:
// `ng test` chạy trong trình duyệt nên không `import fs` được. Đã kiểm thủ công
// một lần bằng `npx vitest run` với hai file thật:
//   Test.ics                  → 36 lần lặp, 1 uid  → "one recurring event"     ✓
//   Lịch học Hà Hiệp Thanh.ics → 30 VEVENT, 22 tên → "only the first is loaded" ✓
