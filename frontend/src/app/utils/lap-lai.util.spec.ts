import { describe, it, expect } from 'vitest';
import {
  docRrule,
  moTaQuyTac,
  taoRrule,
  TOI_DA_LAN,
  traiQuyTac,
  type QuyTacLap,
} from './lap-lai.util';

/** Giờ địa phương, để phép so ngày không bị lệch vì múi giờ. */
const ngay = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h, 0, 0, 0);
const in_ = (ds: Date[]) =>
  ds.map((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);

describe('taoRrule', () => {
  it('không lặp thì không sinh dòng nào', () => {
    expect(taoRrule(null)).toBeNull();
    expect(taoRrule({ freq: '' as unknown as QuyTacLap['freq'] })).toBeNull();
  });

  it('bốn tần suất cơ bản', () => {
    expect(taoRrule({ freq: 'DAILY' })).toBe('RRULE:FREQ=DAILY');
    expect(taoRrule({ freq: 'WEEKLY' })).toBe('RRULE:FREQ=WEEKLY');
    expect(taoRrule({ freq: 'MONTHLY' })).toBe('RRULE:FREQ=MONTHLY');
    expect(taoRrule({ freq: 'YEARLY' })).toBe('RRULE:FREQ=YEARLY');
  });

  it('INTERVAL chỉ ghi khi lớn hơn 1', () => {
    expect(taoRrule({ freq: 'WEEKLY', interval: 1 })).toBe('RRULE:FREQ=WEEKLY');
    expect(taoRrule({ freq: 'WEEKLY', interval: 2 })).toBe('RRULE:FREQ=WEEKLY;INTERVAL=2');
  });

  it('COUNT được ưu tiên hơn UNTIL — RFC cấm dùng cả hai', () => {
    const r = taoRrule({ freq: 'DAILY', count: 5, until: '2026-12-31T00:00:00.000Z' })!;
    expect(r).toContain('COUNT=5');
    expect(r).not.toContain('UNTIL');
  });

  it('UNTIL ghi dạng UTC có hậu tố Z', () => {
    // DTSTART của app ghi dạng UTC; trộn UNTIL dạng giờ địa phương là file
    // không hợp lệ và Apple Calendar từ chối cả sự kiện.
    const r = taoRrule({ freq: 'WEEKLY', until: '2026-12-31T17:00:00.000Z' })!;
    expect(r).toMatch(/UNTIL=\d{8}T\d{6}Z$/);
  });
});

describe('docRrule', () => {
  it('đọc lại được thứ mình vừa ghi ra', () => {
    for (const q of [
      { freq: 'DAILY' as const },
      { freq: 'WEEKLY' as const, interval: 3 },
      { freq: 'MONTHLY' as const, count: 12 },
    ]) {
      expect(docRrule(taoRrule(q)!)).toMatchObject(q);
    }
  });

  it('chấp nhận dòng không có tiền tố RRULE:', () => {
    expect(docRrule('FREQ=DAILY')).toMatchObject({ freq: 'DAILY' });
  });

  it('không phân biệt hoa thường', () => {
    expect(docRrule('rrule:freq=weekly;interval=2')).toMatchObject({
      freq: 'WEEKLY',
      interval: 2,
    });
  });

  it('bỏ qua thành phần lạ mà vẫn đọc được phần hiểu được', () => {
    // File thật hay có BYDAY, WKST, BYSETPOS… App chưa hỗ trợ, nhưng không
    // được vì thế mà vứt cả quy tắc.
    expect(docRrule('RRULE:FREQ=WEEKLY;BYDAY=MO,WE;WKST=SU')).toMatchObject({
      freq: 'WEEKLY',
    });
  });

  it('FREQ không hiểu được thì trả null', () => {
    expect(docRrule('RRULE:FREQ=HOURLY')).toBeNull();
    expect(docRrule('RRULE:FREQ=SECONDLY')).toBeNull();
    expect(docRrule('RRULE:')).toBeNull();
    expect(docRrule('')).toBeNull();
  });

  it('đọc được UNTIL cả dạng có giờ lẫn chỉ có ngày', () => {
    expect(docRrule('RRULE:FREQ=DAILY;UNTIL=20261231T170000Z')?.until).toBe(
      '2026-12-31T17:00:00.000Z',
    );
    expect(docRrule('RRULE:FREQ=DAILY;UNTIL=20261231')?.until).toBe(
      '2026-12-31T00:00:00.000Z',
    );
  });
});

describe('traiQuyTac — trải thành từng lần cụ thể', () => {
  it('không lặp → đúng MỘT mốc', () => {
    expect(traiQuyTac(ngay(2026, 9, 1), null)).toHaveLength(1);
  });

  it('lần ĐẦU luôn nằm trong kết quả', () => {
    // RFC coi DTSTART là lần diễn ra thứ nhất: COUNT=3 là ba lần TẤT CẢ, không
    // phải ba lần lặp THÊM.
    const ds = traiQuyTac(ngay(2026, 9, 1), { freq: 'DAILY', count: 3 });
    expect(in_(ds)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });

  it('hằng tuần', () => {
    const ds = traiQuyTac(ngay(2026, 9, 1), { freq: 'WEEKLY', count: 3 });
    expect(in_(ds)).toEqual(['2026-09-01', '2026-09-08', '2026-09-15']);
  });

  it('INTERVAL: hai tuần một lần', () => {
    const ds = traiQuyTac(ngay(2026, 9, 1), { freq: 'WEEKLY', interval: 2, count: 3 });
    expect(in_(ds)).toEqual(['2026-09-01', '2026-09-15', '2026-09-29']);
  });

  it('giữ nguyên giờ trong ngày qua mọi lần lặp', () => {
    const ds = traiQuyTac(ngay(2026, 9, 1, 14), { freq: 'WEEKLY', count: 3 });
    for (const d of ds) expect(d.getHours()).toBe(14);
  });

  it('UNTIL cắt đúng chỗ', () => {
    const ds = traiQuyTac(ngay(2026, 9, 1), {
      freq: 'DAILY',
      until: ngay(2026, 9, 3, 23).toISOString(),
    });
    expect(in_(ds)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });

  it('quy tắc VÔ HẠN bị chặn ở trần', () => {
    // Không chặn thì một dòng trong .ics đẻ ra hàng nghìn bản ghi và hàng nghìn
    // lời nhắc.
    expect(traiQuyTac(ngay(2026, 9, 1), { freq: 'DAILY' })).toHaveLength(TOI_DA_LAN);
  });

  it('COUNT lớn hơn trần vẫn bị kẹp', () => {
    expect(traiQuyTac(ngay(2026, 9, 1), { freq: 'DAILY', count: 9999 })).toHaveLength(
      TOI_DA_LAN,
    );
  });

  describe('hằng tháng — chỗ Date của JS tự tràn tháng', () => {
    it('ngày 31 KHÔNG nhảy sang tháng sau', () => {
      // `new Date(2026,0,31).setMonth(1)` cho ra 3 tháng 3, vì tháng 2 không có
      // ngày 31. Một cuộc họp "ngày 31 hằng tháng" nhảy sang mùng 3 là sai hẳn.
      const ds = traiQuyTac(ngay(2026, 1, 31), { freq: 'MONTHLY', count: 4 });
      expect(in_(ds)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    });

    it('ngày 30 vào tháng 2 kẹp về 28', () => {
      const ds = traiQuyTac(ngay(2026, 1, 30), { freq: 'MONTHLY', count: 2 });
      expect(in_(ds)).toEqual(['2026-01-30', '2026-02-28']);
    });

    it('ngày an toàn thì giữ nguyên qua mọi tháng', () => {
      const ds = traiQuyTac(ngay(2026, 1, 15), { freq: 'MONTHLY', count: 3 });
      expect(in_(ds)).toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
    });

    it('bắc qua ranh giới năm', () => {
      const ds = traiQuyTac(ngay(2026, 11, 15), { freq: 'MONTHLY', count: 3 });
      expect(in_(ds)).toEqual(['2026-11-15', '2026-12-15', '2027-01-15']);
    });
  });

  describe('hằng năm — ngày 29 tháng 2', () => {
    it('năm không nhuận kẹp về 28, KHÔNG nhảy sang 1 tháng 3', () => {
      // 2028 nhuận, 2029/2030 không.
      const ds = traiQuyTac(ngay(2028, 2, 29), { freq: 'YEARLY', count: 3 });
      expect(in_(ds)).toEqual(['2028-02-29', '2029-02-28', '2030-02-28']);
    });

    it('ngày thường giữ nguyên', () => {
      const ds = traiQuyTac(ngay(2026, 6, 10), { freq: 'YEARLY', count: 3 });
      expect(in_(ds)).toEqual(['2026-06-10', '2027-06-10', '2028-06-10']);
    });
  });
});

describe('moTaQuyTac', () => {
  it('câu chữ đọc được cho từng trường hợp', () => {
    expect(moTaQuyTac(null)).toBe('Does not repeat');
    expect(moTaQuyTac({ freq: 'DAILY' })).toBe('Every day');
    expect(moTaQuyTac({ freq: 'WEEKLY', interval: 2 })).toBe('Every 2 weeks');
    expect(moTaQuyTac({ freq: 'MONTHLY', count: 6 })).toBe('Every month, 6 times');
    expect(moTaQuyTac({ freq: 'YEARLY', until: '2030-01-01T00:00:00.000Z' })).toContain(
      'until',
    );
  });
});
