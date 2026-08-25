import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH, checkPassword } from './password.util';

/** Đọc nhanh trạng thái một điều kiện theo id. */
function rule(password: string, id: string, context = {}): boolean {
  return checkPassword(password, context).rules.find((r) => r.id === id)!.ok;
}

describe('checkPassword', () => {
  describe('bốn điều kiện bắt buộc', () => {
    it(`độ dài: dưới ${MIN_PASSWORD_LENGTH} ký tự là trượt, đúng ${MIN_PASSWORD_LENGTH} là đạt`, () => {
      expect(rule('Ab1cdef', 'length')).toBe(false); // 7
      expect(rule('Ab1cdefg', 'length')).toBe(true); // 8
    });

    it('chữ hoa + thường: thiếu một bên là trượt', () => {
      expect(rule('abcdefg1', 'case')).toBe(false);
      expect(rule('ABCDEFG1', 'case')).toBe(false);
      expect(rule('Abcdefg1', 'case')).toBe(true);
    });

    it('chữ số: không có số là trượt', () => {
      expect(rule('Abcdefgh', 'digit')).toBe(false);
      expect(rule('Abcdefg1', 'digit')).toBe(true);
    });

    it('mật khẩu phổ biến bị chặn dù đủ mọi điều kiện khác', () => {
      // 'Passw0rd' đủ dài, đủ hoa/thường/số — nhưng nằm trong danh sách.
      const kq = checkPassword('Passw0rd');
      expect(rule('Passw0rd', 'length')).toBe(true);
      expect(rule('Passw0rd', 'case')).toBe(true);
      expect(rule('Passw0rd', 'digit')).toBe(true);
      expect(rule('Passw0rd', 'notObvious')).toBe(false);
      expect(kq.meetsPolicy).toBe(false);
    });

    it('không phân biệt hoa thường khi dò danh sách phổ biến', () => {
      expect(rule('QWERTY123', 'notObvious')).toBe(false);
    });

    it('ô trống thì KHÔNG điều kiện nào đạt (kể cả notObvious)', () => {
      const kq = checkPassword('');
      expect(kq.rules.every((r) => !r.ok)).toBe(true);
      expect(kq.meetsPolicy).toBe(false);
    });
  });

  describe('không cho lấy chính danh tính mình làm mật khẩu', () => {
    it('chặn khi chứa phần trước @ của email', () => {
      expect(rule('Hoangdz2026', 'notObvious', { email: 'hoangdz@test.dev' })).toBe(false);
    });

    it('chặn khi chứa username hoặc một phần của tên hiển thị', () => {
      expect(rule('Nguyen2026x', 'notObvious', { displayName: 'Nguyen Van A' })).toBe(false);
      expect(rule('Abcthanh12', 'notObvious', { username: 'thanh' })).toBe(false);
    });

    it('mẩu dưới 3 ký tự thì bỏ qua — tên "Lê" không được cấm mọi mật khẩu chứa "le"', () => {
      expect(rule('Molecule12', 'notObvious', { displayName: 'Lê' })).toBe(true);
    });

    it('không có ngữ cảnh thì chỉ dò danh sách phổ biến', () => {
      expect(rule('Xk92mQpz', 'notObvious')).toBe(true);
    });
  });

  describe('điểm mạnh', () => {
    it('mật khẩu rỗng: điểm 0, không có nhãn', () => {
      const kq = checkPassword('');
      expect(kq.score).toBe(0);
      expect(kq.label).toBe('');
      expect(kq.percent).toBe(0);
    });

    it('chưa qua chính sách thì trần điểm là 2 — không bao giờ hiện xanh lá', () => {
      // Dài và có ký tự đặc biệt, nhưng thiếu chữ số -> vẫn phải bị ghìm.
      const kq = checkPassword('Abcdefghijkl!');
      expect(kq.meetsPolicy).toBe(false);
      expect(kq.score).toBeLessThanOrEqual(2);
    });

    it('dài hơn và có ký tự đặc biệt thì điểm cao hơn', () => {
      const vua = checkPassword('Abcdefg1');
      const dai = checkPassword('Abcdefg1hijkl');
      const daiVaDacBiet = checkPassword('Abcdefg1hijkl!');

      expect(vua.meetsPolicy).toBe(true);
      expect(dai.score).toBeGreaterThan(vua.score);
      expect(daiVaDacBiet.score).toBeGreaterThan(dai.score);
      expect(daiVaDacBiet.score).toBe(5);
    });

    it('percent bám theo score, không vượt 100', () => {
      expect(checkPassword('Abcdefg1hijkl!').percent).toBe(100);
      expect(checkPassword('Abcdefg1').percent).toBeLessThan(100);
    });
  });
});
