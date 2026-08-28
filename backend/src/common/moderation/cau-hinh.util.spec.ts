import { ConfigService } from '@nestjs/config';
import { docCauHinh } from './cau-hinh.util';
import { GeminiVisionProvider } from './gemini-vision.provider';

const cfg = (o: Record<string, string | undefined>) =>
  ({ get: (k: string) => o[k] }) as unknown as ConfigService;

describe('docCauHinh', () => {
  it('trả về giá trị khi có', () => {
    expect(docCauHinh(cfg({ A: 'x' }), 'A')).toBe('x');
  });

  it('CHUỖI RỖNG được coi là CHƯA ĐẶT', () => {
    // Trong `.env`, `FOO=` mang nghĩa "chưa đặt". `ConfigService.get()` trả về
    // `''` chứ không phải `undefined`, nên `??` không rơi sang vế sau.
    expect(docCauHinh(cfg({ A: '' }), 'A')).toBeUndefined();
    expect(docCauHinh(cfg({ A: '   ' }), 'A')).toBeUndefined();
  });

  it('rơi sang biến dự phòng khi biến đầu rỗng', () => {
    expect(docCauHinh(cfg({ A: '', B: 'y' }), 'A', 'B')).toBe('y');
  });

  it('biến đầu có giá trị thì KHÔNG dùng dự phòng', () => {
    expect(docCauHinh(cfg({ A: 'x', B: 'y' }), 'A', 'B')).toBe('x');
  });

  it('cắt khoảng trắng thừa hai đầu', () => {
    expect(docCauHinh(cfg({ A: '  x  ' }), 'A')).toBe('x');
  });

  it('không biến nào có thì trả undefined', () => {
    expect(docCauHinh(cfg({}), 'A', 'B')).toBeUndefined();
  });
});

describe('GeminiVisionProvider — chọn khoá', () => {
  it('MODERATION_GEMINI_API_KEY để TRỐNG vẫn rơi về GEMINI_API_KEY', () => {
    // Đây là lỗi thật đã gặp: file .env mẫu để sẵn dòng trống cho người dùng
    // điền, và dòng trống đó làm nhà cung cấp tự tắt. Vì đang fail-closed, hệ
    // quả là MỌI ảnh tải lên bị từ chối — chỉ vì một dòng để trống.
    const p = new GeminiVisionProvider(
      cfg({ MODERATION_GEMINI_API_KEY: '', GEMINI_API_KEY: 'khoa-chung' }),
    );
    expect(p.bat).toBe(true);
  });

  it('có khoá riêng thì ưu tiên khoá riêng', () => {
    const p = new GeminiVisionProvider(
      cfg({
        MODERATION_GEMINI_API_KEY: 'khoa-rieng',
        GEMINI_API_KEY: 'khoa-chung',
      }),
    );
    expect(p.bat).toBe(true);
  });

  it('cả hai đều trống thì provider tắt', () => {
    const p = new GeminiVisionProvider(
      cfg({ MODERATION_GEMINI_API_KEY: '', GEMINI_API_KEY: '' }),
    );
    expect(p.bat).toBe(false);
  });
});
