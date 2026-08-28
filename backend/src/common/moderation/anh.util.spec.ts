import { doanLoaiAnh } from './anh.util';

/** Dựng buffer bắt đầu bằng các byte cho trước, phần đuôi là rác. */
function buf(...dau: number[]): Buffer {
  return Buffer.concat([Buffer.from(dau), Buffer.alloc(32, 0x41)]);
}
const chu = (s: string) => Buffer.from(s, 'ascii');

describe('doanLoaiAnh — nhận dạng bằng magic bytes', () => {
  it('nhận đúng JPEG, PNG, GIF, WEBP', () => {
    expect(doanLoaiAnh(buf(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg');
    expect(
      doanLoaiAnh(buf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
    ).toBe('png');
    expect(doanLoaiAnh(Buffer.concat([chu('GIF89a'), Buffer.alloc(32)]))).toBe(
      'gif',
    );
    expect(
      doanLoaiAnh(
        Buffer.concat([
          chu('RIFF'),
          Buffer.alloc(4),
          chu('WEBP'),
          Buffer.alloc(32),
        ]),
      ),
    ).toBe('webp');
  });

  it('KHÔNG nhận file thực thi dù đặt tên là ảnh', () => {
    // Đây là cả lý do hàm này tồn tại: `file.mimetype` do CLIENT khai, nên đổi
    // tên `virus.exe` thành `anh.png` rồi khai `image/png` là qua được mọi
    // danh sách trắng dựa trên mimetype.
    expect(doanLoaiAnh(buf(0x4d, 0x5a))).toBeNull(); // MZ — .exe của Windows
    expect(doanLoaiAnh(buf(0x7f, 0x45, 0x4c, 0x46))).toBeNull(); // ELF — nhị phân Linux
    expect(doanLoaiAnh(chu('%PDF-1.7\n%aaaaaaaaaaa'))).toBeNull();
    expect(doanLoaiAnh(chu('<?php system($_GET[0]); ?>  aaaaaaa'))).toBeNull();
  });

  it('RIFF mà KHÔNG phải WEBP thì không nhận nhầm', () => {
    // WAV và AVI cũng bắt đầu bằng "RIFF" — chỉ xét 4 byte đầu là nhận nhầm.
    expect(
      doanLoaiAnh(
        Buffer.concat([
          chu('RIFF'),
          Buffer.alloc(4),
          chu('WAVE'),
          Buffer.alloc(32),
        ]),
      ),
    ).toBeNull();
    expect(
      doanLoaiAnh(
        Buffer.concat([
          chu('RIFF'),
          Buffer.alloc(4),
          chu('AVI '),
          Buffer.alloc(32),
        ]),
      ),
    ).toBeNull();
  });

  it('buffer rỗng hoặc quá ngắn thì trả null, không nổ', () => {
    expect(doanLoaiAnh(Buffer.alloc(0))).toBeNull();
    expect(doanLoaiAnh(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(doanLoaiAnh(undefined as unknown as Buffer)).toBeNull();
  });

  it('nhận cả GIF87a lẫn GIF89a', () => {
    expect(doanLoaiAnh(Buffer.concat([chu('GIF87a'), Buffer.alloc(32)]))).toBe(
      'gif',
    );
    expect(doanLoaiAnh(Buffer.concat([chu('GIF89a'), Buffer.alloc(32)]))).toBe(
      'gif',
    );
  });
});
