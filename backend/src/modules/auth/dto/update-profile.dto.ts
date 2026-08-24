import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Body của PATCH /auth/profile — các trường người dùng tự sửa trong trang Cài đặt.
 *
 * KHÔNG cho sửa `email` ở đây: email do Firebase quản lý, đổi ở DB mà không đổi
 * bên Firebase sẽ khiến 2 nơi lệch nhau. Muốn đổi email phải đi qua luồng riêng
 * của Firebase (verify email mới).
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Display name must be at most 50 characters.' })
  displayName?: string;

  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters.' })
  @MaxLength(25, { message: 'Username must be at most 25 characters.' })
  @Matches(/^[a-zA-Z0-9_.]+$/, {
    message: 'Username can only contain letters, numbers, dots, and underscores.',
  })
  username?: string;

  @IsOptional()
  @IsString()
  @Matches(/^0\d{9}$/, { message: 'Invalid phone number (e.g. 0912345678).' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60, { message: 'Job title must be at most 60 characters.' })
  jobTitle?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
