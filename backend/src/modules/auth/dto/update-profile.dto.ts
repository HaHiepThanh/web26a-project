import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Body của PATCH /auth/profile — các trường người dùng tự sửa trong trang Cài đặt.
 *
 * KHÔNG cho sửa `email` ở đây: email do Firebase quản lý, đổi ở DB mà không đổi
 * bên Firebase sẽ khiến 2 nơi lệch nhau. Muốn đổi email phải đi qua luồng riêng
 * của Firebase (verify email mới).
 *
 * ⚠️ Ba trạng thái của mỗi field optional — ĐỪNG gộp làm một:
 *   - Field VẮNG MẶT hẳn trong body (`undefined`)  → không đụng tới, giữ nguyên.
 *   - Field gửi lên là CHUỖI RỖNG (`''`)            → xoá về null.
 *   - Field gửi lên có giá trị                      → validate định dạng rồi lưu.
 *   `@IsOptional()` chỉ lo trường hợp đầu (bỏ qua validate khi `undefined`).
 *   `@ValidateIf` thêm ở dưới lo trường hợp hai: chuỗi rỗng không phải "sai định
 *   dạng số điện thoại/username", nó là "xoá" — chạy nó qua @Matches/@MinLength
 *   thì luôn trượt. Thiếu `@ValidateIf` từng khiến sửa MỘT field (vd avatar) mà
 *   frontend lỡ gộp chung request với field optional khác đang để trống
 *   (username/phone) là cả request vỡ 400, dù người dùng chẳng đụng tới field đó.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Display name must be at most 50 characters.' })
  displayName?: string;

  @IsOptional()
  @ValidateIf((o: UpdateProfileDto) => !!o.username)
  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters.' })
  @MaxLength(25, { message: 'Username must be at most 25 characters.' })
  @Matches(/^[a-zA-Z0-9_.]+$/, {
    message:
      'Username can only contain letters, numbers, dots, and underscores.',
  })
  username?: string;

  @IsOptional()
  @ValidateIf((o: UpdateProfileDto) => !!o.phone)
  @IsString()
  @Matches(/^0\d{9}$/, { message: 'Invalid phone number (e.g. 0912345678).' })
  phone?: string;

  @IsOptional()
  @ValidateIf((o: UpdateProfileDto) => !!o.jobTitle)
  @IsString()
  @MaxLength(60, { message: 'Job title must be at most 60 characters.' })
  jobTitle?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
