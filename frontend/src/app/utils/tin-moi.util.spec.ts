import { describe, it, expect } from 'vitest';
import { Message } from '../models';
import { mocMoi, tinMoiHon } from './tin-moi.util';

const m = (id: string, at: string): Message => ({
  id, orgId: 'o', boardId: 'b', userId: 'u', content: id, createdAt: at,
});

const CU = [m('a', '2026-01-01T00:00:00Z'), m('b', '2026-01-02T00:00:00Z')];

describe('tinMoiHon', () => {
  it('chưa có mốc thì chưa coi tin nào là mới', () => {
    // Lần nạp đầu tiên là TẢI, không phải TIN VỪA TỚI.
    expect(tinMoiHon(CU, '')).toEqual([]);
  });

  it('chỉ lấy tin muộn hơn mốc', () => {
    expect(tinMoiHon(CU, '2026-01-01T00:00:00Z').map((x) => x.id)).toEqual(['b']);
  });

  it('CHÈN TIN CŨ vào đầu KHÔNG bị coi là tin mới', () => {
    // Chính cái bẫy mà phân trang tạo ra. Cách đếm theo số lượng
    // (`slice(daXet)`) sẽ cắt nhầm hai tin MỚI NHẤT và báo chuông cho chúng.
    const sauKhiCuonLen = [
      m('cu-1', '2025-12-30T00:00:00Z'),
      m('cu-2', '2025-12-31T00:00:00Z'),
      ...CU,
    ];
    expect(tinMoiHon(sauKhiCuonLen, '2026-01-02T00:00:00Z')).toEqual([]);
  });

  it('vừa chèn tin cũ vừa có tin mới thật thì chỉ báo tin mới thật', () => {
    const tron = [
      m('cu-1', '2025-12-30T00:00:00Z'),
      ...CU,
      m('moi', '2026-01-03T00:00:00Z'),
    ];
    expect(tinMoiHon(tron, '2026-01-02T00:00:00Z').map((x) => x.id)).toEqual(['moi']);
  });
});

describe('mocMoi', () => {
  it('lấy tin muộn nhất', () => {
    expect(mocMoi(CU, '')).toBe('2026-01-02T00:00:00Z');
  });

  it('KHÔNG BAO GIỜ lùi lại khi chèn tin cũ', () => {
    // Lùi mốc là lần sau mọi tin cũ hơn lại thành "mới" một lần nữa.
    expect(mocMoi([m('cu', '2025-01-01T00:00:00Z')], '2026-01-02T00:00:00Z'))
      .toBe('2026-01-02T00:00:00Z');
  });

  it('danh sách rỗng thì giữ nguyên mốc', () => {
    expect(mocMoi([], '2026-01-02T00:00:00Z')).toBe('2026-01-02T00:00:00Z');
  });
});
