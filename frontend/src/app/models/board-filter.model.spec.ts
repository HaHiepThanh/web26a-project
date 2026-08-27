import { describe, it, expect } from 'vitest';
import { DATE_OPTIONS, DateFilter, khopMocHan, NO_LABEL, UNASSIGNED } from './board-filter.model';

const HOM_NAY = '2026-09-10';

describe('khopMocHan — "No due date"', () => {
  it('thẻ CHƯA đặt hạn thì khớp', () => {
    // Đây là lỗi gốc: thẻ tạo mặc định không có hạn, mà nút "No due date" lại
    // không trả về chúng.
    expect(khopMocHan(null, 'no_due', HOM_NAY)).toBe(true);
    expect(khopMocHan(undefined, 'no_due', HOM_NAY)).toBe(true);
    expect(khopMocHan('', 'no_due', HOM_NAY)).toBe(true);
  });

  it('thẻ CÓ hạn thì KHÔNG khớp — kể cả hạn nằm trong 7 ngày tới', () => {
    // Trước khi sửa, 'no_due' rơi xuống nhánh cuối nên trả về đúng những thẻ
    // này — ngược hẳn nút người dùng bấm.
    expect(khopMocHan('2026-09-12', 'no_due', HOM_NAY)).toBe(false);
    expect(khopMocHan('2026-09-10', 'no_due', HOM_NAY)).toBe(false);
    expect(khopMocHan('2026-01-01', 'no_due', HOM_NAY)).toBe(false);
  });
});

describe('khopMocHan — các mốc còn lại', () => {
  it('thẻ chưa đặt hạn KHÔNG lọt vào mốc nào khác', () => {
    for (const m of ['overdue', 'today', 'week'] as DateFilter[]) {
      expect(khopMocHan(null, m, HOM_NAY), m).toBe(false);
    }
  });

  it('overdue = đã qua hạn, không tính hôm nay', () => {
    expect(khopMocHan('2026-09-09', 'overdue', HOM_NAY)).toBe(true);
    expect(khopMocHan('2026-09-10', 'overdue', HOM_NAY)).toBe(false);
    expect(khopMocHan('2026-09-11', 'overdue', HOM_NAY)).toBe(false);
  });

  it('today = đúng hôm nay', () => {
    expect(khopMocHan('2026-09-10', 'today', HOM_NAY)).toBe(true);
    expect(khopMocHan('2026-09-11', 'today', HOM_NAY)).toBe(false);
  });

  it('week = hôm nay tới hôm nay + 6 ngày, khớp nhãn "Next 7 days"', () => {
    expect(khopMocHan('2026-09-10', 'week', HOM_NAY)).toBe(true); // ngày đầu
    expect(khopMocHan('2026-09-16', 'week', HOM_NAY)).toBe(true); // ngày thứ 7
    expect(khopMocHan('2026-09-17', 'week', HOM_NAY)).toBe(false); // ngày thứ 8
    expect(khopMocHan('2026-09-09', 'week', HOM_NAY)).toBe(false); // đã qua
  });

  it('week bắc qua ranh giới tháng vẫn đúng', () => {
    expect(khopMocHan('2026-10-02', 'week', '2026-09-28')).toBe(true);
    expect(khopMocHan('2026-10-05', 'week', '2026-09-28')).toBe(false);
  });

  it('week bắc qua ranh giới năm vẫn đúng', () => {
    expect(khopMocHan('2027-01-02', 'week', '2026-12-30')).toBe(true);
    expect(khopMocHan('2027-01-06', 'week', '2026-12-30')).toBe(false);
  });
});

describe('hợp đồng của bộ lọc', () => {
  it('MỌI mốc trong DateFilter đều có nút trên giao diện', () => {
    // Thêm một mốc vào kiểu mà quên thêm nút thì người dùng không bao giờ dùng
    // được nó; thêm nút mà quên mốc thì bấm vào không có gì xảy ra — chính là
    // chuyện đã xảy ra với 'no_due'.
    const moc: DateFilter[] = ['overdue', 'today', 'week', 'no_due'];
    expect(DATE_OPTIONS.map((o) => o.id).sort()).toEqual([...moc].sort());
  });

  it('mỗi mốc chỉ xuất hiện MỘT lần và đều có nhãn', () => {
    const ids = DATE_OPTIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DATE_OPTIONS.every((o) => o.label.trim().length > 0)).toBe(true);
  });

  it('mỗi mốc đều được khopMocHan xử lý, không mốc nào rơi vào nhánh mặc định', () => {
    // Một thẻ CHƯA có hạn chỉ được đúng 'no_due' nhận. Mốc nào cũng nhận nó
    // nghĩa là mốc đó đang rơi nhầm nhánh.
    const nhan = DATE_OPTIONS.filter((o) => khopMocHan(null, o.id, HOM_NAY));
    expect(nhan.map((o) => o.id)).toEqual(['no_due']);
  });

  it('hai sentinel khác nhau và không thể trùng một id thật', () => {
    // Firebase uid và uuid đều không chứa dấu gạch dưới.
    expect(UNASSIGNED).not.toBe(NO_LABEL);
    for (const s of [UNASSIGNED, NO_LABEL]) {
      expect(s).toContain('__');
      expect(/^[A-Za-z0-9-]+$/.test(s)).toBe(false);
    }
  });
});
