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
  @MaxLength(50, { message: 'Họ tên tối đa 50 ký tự.' })
  displayName?: string;

  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Tên đăng nhập cần tối thiểu 3 ký tự.' })
  @MaxLength(25, { message: 'Tên đăng nhập tối đa 25 ký tự.' })
  @Matches(/^[a-zA-Z0-9_.]+$/, {
    message: 'Tên đăng nhập chỉ gồm chữ, số, dấu chấm và gạch dưới.',
  })
  username?: string;

  @IsOptional()
  @IsString()
  @Matches(/^0\d{9}$/, { message: 'Số điện thoại không hợp lệ (VD: 0912345678).' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60, { message: 'Chức vụ tối đa 60 ký tự.' })
  jobTitle?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
