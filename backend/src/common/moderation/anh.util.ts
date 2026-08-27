/**
 * Nhận dạng ảnh bằng MAGIC BYTES, không tin `mimetype` client gửi lên.
 *
 * ⚠️ `file.mimetype` của Multer lấy thẳng từ header `Content-Type` trong phần
 *    multipart — tức là do CLIENT khai. Đổi tên `virus.exe` thành `anh.png` và
 *    khai `image/png` là qua được mọi danh sách trắng dựa trên mimetype.
 *
 *    Vài byte đầu file thì không khai man được: chúng là dữ liệu thật của định
 *    dạng. Nên mọi quyết định "đây có phải ảnh không" đều phải hỏi hàm này.
 */
export type LoaiAnh = 'jpeg' | 'png' | 'webp' | 'gif' | null;

export function doanLoaiAnh(buffer: Buffer): LoaiAnh {
  if (!buffer || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e &&
    buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a &&
    buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return 'png';
  }

  // GIF: "GIF87a" hoặc "GIF89a"
  if (buffer.subarray(0, 3).toString('ascii') === 'GIF') return 'gif';

  // WEBP: "RIFF" ở byte 0-3 và "WEBP" ở byte 8-11 — phải xét CẢ HAI, vì RIFF
  // còn là vỏ của WAV và AVI.
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }

  return null;
}

/** MIME chuẩn theo loại thật, dùng thay cho chuỗi client gửi lên. */
export const MIME_THEO_LOAI: Record<Exclude<LoaiAnh, null>, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

export const DUOI_THEO_LOAI: Record<Exclude<LoaiAnh, null>, string> = {
  jpeg: '.jpg',
  png: '.png',
  webp: '.webp',
  gif: '.gif',
};
