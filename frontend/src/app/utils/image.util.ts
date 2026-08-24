const MAX_BG_WIDTH = 1600; // Đủ nét làm nền full-HD, không cần to hơn.
const BG_JPEG_QUALITY = 0.82;

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Thu nhỏ + nén ảnh về JPEG trước khi lưu. localStorage chỉ ~5MB mà 1 ảnh PNG
 *  800x600 đã ngốn ~620KB base64 — không nén thì vài board là vỡ quota. */
export async function compressImage(file: File): Promise<string> {
  const originalUrl = await readAsDataUrl(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to read image'));
    img.src = originalUrl;
  });

  const scale = Math.min(1, MAX_BG_WIDTH / img.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return originalUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const compressed = canvas.toDataURL('image/jpeg', BG_JPEG_QUALITY);
  // Ảnh nhỏ/đơn sắc đôi khi nén ra còn nặng hơn bản gốc — giữ bản nhẹ hơn.
  return compressed.length < originalUrl.length ? compressed : originalUrl;
}
