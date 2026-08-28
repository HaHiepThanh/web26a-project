import { describe, it, expect } from 'vitest';
import { trongTamNhin } from './trong-tam-nhin.util';

const KHUNG = { top: 100, bottom: 600 };

describe('trongTamNhin', () => {
  it('nằm gọn giữa khung → không cần cuộn', () => {
    expect(trongTamNhin({ top: 200, bottom: 260 }, KHUNG)).toBe(true);
  });

  it('ở trên khung → phải cuộn', () => {
    expect(trongTamNhin({ top: 10, bottom: 70 }, KHUNG)).toBe(false);
  });

  it('ở dưới khung → phải cuộn', () => {
    expect(trongTamNhin({ top: 700, bottom: 760 }, KHUNG)).toBe(false);
  });

  it('ló một nửa ra ngoài → vẫn phải cuộn', () => {
    // Nháy sáng một tin đang bị cắt mất nửa trên thì người dùng không thấy gì.
    expect(trongTamNhin({ top: 60, bottom: 140 }, KHUNG)).toBe(false);
    expect(trongTamNhin({ top: 560, bottom: 640 }, KHUNG)).toBe(false);
  });

  it('sát mép trong phạm vi lề → coi như phải cuộn', () => {
    // Lề 8px: dính sát mép trên thì vẫn khó đọc, cuộn cho vào giữa.
    expect(trongTamNhin({ top: 103, bottom: 160 }, KHUNG)).toBe(false);
    expect(trongTamNhin({ top: 110, bottom: 160 }, KHUNG)).toBe(true);
  });

  it('tin DÀI HƠN CẢ KHUNG mà đang phủ kín khung → không cuộn', () => {
    // Không có nhánh riêng thì một tin dài không bao giờ "nằm trọn", nên lần
    // nào bấm cũng bị cuộn lại dù nó đang chiếm trọn màn hình.
    expect(trongTamNhin({ top: 50, bottom: 900 }, KHUNG)).toBe(true);
  });

  it('tin dài hơn khung nhưng đã trôi lên gần hết → phải cuộn', () => {
    expect(trongTamNhin({ top: -800, bottom: 50 }, KHUNG)).toBe(false);
  });
});
