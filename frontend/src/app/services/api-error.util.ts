import { HttpErrorResponse } from '@angular/common/http';

/**
 * Đổi lỗi HTTP từ backend thành một câu tiếng Việt hiển thị được cho người dùng.
 *
 * Backend NestJS trả body dạng `{ message, error, statusCode }`, trong đó `message`
 * có thể là chuỗi (do ta tự ném `ForbiddenException('...')`) hoặc MẢNG chuỗi (do
 * ValidationPipe gom lỗi của từng field trong DTO). Phải xử lý cả hai.
 */
export function describeError(e: unknown, macDinh = 'Something went wrong, please try again later.'): string {
  if (e instanceof HttpErrorResponse) {
    // status 0 = trình duyệt không gọi tới nơi: backend chưa chạy, sai cổng, hoặc CORS.
    if (e.status === 0) {
      return "Couldn't reach the server. Is the backend running (npm run start:dev)?";
    }
    const msg = (e.error as { message?: string | string[] } | null)?.message;
    if (Array.isArray(msg) && msg.length) return msg.join(' ');
    if (typeof msg === 'string' && msg) return msg;
    if (e.status === 401) return 'Your session has expired. Please sign in again.';
    return macDinh;
  }
  return macDinh;
}

/** Mã HTTP của lỗi, hoặc 0 nếu không phải lỗi HTTP. Dùng khi cần phân biệt 404 với 403. */
export function errorStatus(e: unknown): number {
  return e instanceof HttpErrorResponse ? e.status : 0;
}
