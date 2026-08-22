import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateCardDto {
  // 'loose': chỉ kiểm tra đúng hình dạng 8-4-4-4-12 hex, không ép version/variant.
  // Bắt buộc vì id seed sinh bằng md5(...)::uuid — nibble version/variant là
  // ngẫu nhiên theo hash, phần lớn KHÔNG khớp version 1-8 chuẩn RFC4122, nên
  // 'all' (mặc định) hay '4' đều trượt nhầm những id có thật trong DB.
  @IsUUID('loose', { message: 'listId phải là uuid.' })
  listId: string;

  @IsString()
  @MinLength(1, { message: 'Tên thẻ không được để trống.' })
  @MaxLength(200, { message: 'Tên thẻ tối đa 200 ký tự.' })
  title: string;
}
