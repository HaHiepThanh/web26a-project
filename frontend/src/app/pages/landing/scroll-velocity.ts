/**
 * Vận tốc cuộn hiện thời, tính bằng pixel mỗi khung hình, do Lenis ghi vào.
 *
 * Cố ý là BIẾN MODULE THƯỜNG chứ không phải signal của Angular. Giá trị này bị
 * ghi và bị đọc mỗi khung hình — 60 lần một giây, nhân với số phần tử đang nghe.
 * Signal sẽ kéo theo cả bộ máy theo dõi phụ thuộc và lịch phát hiện thay đổi
 * cho một con số mà không một template nào đọc tới. Ở đây chỉ cần một ô nhớ.
 *
 * Dấu của giá trị mang ý nghĩa: dương là đang cuộn xuống, âm là cuộn lên.
 */
let velocity = 0;

export function setScrollVelocity(value: number): void {
  velocity = value;
}

export function getScrollVelocity(): number {
  return velocity;
}

/**
 * Về 0 khi rời trang. Không đặt lại thì lần sau quay lại trang, phần tử đầu
 * tiên nghe được sẽ đọc phải vận tốc của lần cuộn trước đó và giật một cái
 * trước khi kịp về vị trí nghỉ.
 */
export function resetScrollVelocity(): void {
  velocity = 0;
}
