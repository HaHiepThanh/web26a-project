import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { SLUG_MAX_LENGTH, SLUG_MIN_LENGTH } from '../constants/reserved-slugs';

/**
 * Body của POST /organizations.
 *
 * `ValidationPipe` (bật sẵn ở main.ts) tự chạy file này — sai định dạng là trả
 * 400 kèm lời nhắn bên dưới, không cần kiểm tra lại trong service.
 *
 * Riêng "slug có nằm trong danh sách từ khoá hệ thống không" thì làm ở service:
 * đó là luật nghiệp vụ, không phải định dạng.
 */
export class CreateOrganizationDto {
  @IsString()
  @MinLength(1, { message: 'Tên tổ chức không được để trống.' })
  @MaxLength(100, { message: 'Tên tổ chức tối đa 100 ký tự.' })
  name: string;

  @IsString()
  @MinLength(SLUG_MIN_LENGTH, { message: `Đường dẫn phải có ít nhất ${SLUG_MIN_LENGTH} ký tự.` })
  @MaxLength(SLUG_MAX_LENGTH, { message: `Đường dẫn tối đa ${SLUG_MAX_LENGTH} ký tự.` })
  // Khớp đúng CHECK constraint của cột `organizations.slug` trong database.sql.
  // Chặn ở đây để client nhận 400 có lời nhắn, thay vì để DB vỡ thành 500.
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message:
      'Đường dẫn chỉ gồm chữ thường không dấu, số và gạch ngang (không bắt đầu/kết thúc bằng gạch ngang).',
  })
  slug: string;
}
