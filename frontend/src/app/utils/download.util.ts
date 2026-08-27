/**
 * Đưa một chuỗi cho người dùng tải về thành file.
 *
 * ⚠️ `URL.revokeObjectURL` phải HOÃN lại, không gọi ngay sau `click()`.
 *    Safari đọc blob một cách bất đồng bộ; thu hồi ngay là nó huỷ luôn lượt
 *    tải và người dùng nhận về một file rỗng, không có lỗi nào báo.
 */
export function taiVeFile(tenFile: string, noiDung: string, mime: string): void {
  const blob = new Blob([noiDung], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = tenFile;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** `text/calendar` là kiểu MIME khiến máy nhận ra đây là file lịch và mở bằng
 *  Apple Calendar / Google Calendar thay vì trình soạn thảo văn bản. */
export const MIME_ICS = 'text/calendar;charset=utf-8';

/**
 * Tên file an toàn trên mọi hệ điều hành.
 *
 * Windows cấm `\ / : * ? " < > |`, và tên board thường có dấu hai chấm hoặc
 * gạch chéo. Không lọc thì trình duyệt lặng lẽ đổi tên hoặc bỏ hẳn lượt tải.
 */
export function tenFileAnToan(goc: string, duoi: string): string {
  const sach = goc
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${sach || 'lich-hop'}.${duoi}`;
}
