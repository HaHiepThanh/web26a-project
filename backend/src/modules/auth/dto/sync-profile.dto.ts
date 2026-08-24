import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

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
  @MinLength(3, { message: 'Username must be at least 3 characters.' })
  @MaxLength(30, { message: 'Username must be at most 30 characters.' })
  username?: string;

  @IsOptional()
  @IsString()
  @Matches(/^0\d{9}$/, { message: 'Invalid phone number (e.g. 0912345678).' })
  phone?: string;
}
