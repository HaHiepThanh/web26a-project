import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Body (tuỳ chọn) của POST /auth/sync — chỉ dùng lúc ĐĂNG KÝ, để lưu 2 thông tin
 * người dùng tự nhập mà Firebase ID token không có.
 *
 * ValidationPipe ở main.ts bật `whitelist: true` nên field lạ bị loại bỏ —
 * client không thể nhét thêm cột khác vào bảng users qua đường này.
 */
export class SyncProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Tên đăng nhập cần tối thiểu 3 ký tự.' })
  @MaxLength(30, { message: 'Tên đăng nhập tối đa 30 ký tự.' })
  username?: string;

  @IsOptional()
  @IsString()
  @Matches(/^0\d{9}$/, { message: 'Số điện thoại không hợp lệ (VD: 0912345678).' })
  phone?: string;
}
