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
  @MinLength(1, { message: 'Organization name is required.' })
  @MaxLength(100, { message: 'Organization name must be at most 100 characters.' })
  name: string;

  @IsString()
  @MinLength(SLUG_MIN_LENGTH, { message: `URL must be at least ${SLUG_MIN_LENGTH} characters.` })
  @MaxLength(SLUG_MAX_LENGTH, { message: `URL must be at most ${SLUG_MAX_LENGTH} characters.` })
  // Khớp đúng CHECK constraint của cột `organizations.slug` trong database.sql.
  // Chặn ở đây để client nhận 400 có lời nhắn, thay vì để DB vỡ thành 500.
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message:
      'Only lowercase letters, numbers, and hyphens are allowed (cannot start or end with a hyphen).',
  })
  slug: string;
}
