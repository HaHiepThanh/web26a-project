import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * ⚠️ Phải là CLASS, không phải interface hay kiểu inline.
 *
 * `ValidationPipe` đọc metadata do decorator sinh ra lúc chạy. Kiểu TypeScript
 * bị xoá sạch khi biên dịch, nên `@Body() body: { name: string }` không kiểm gì
 * cả: gửi `name: 12345` là service gọi `name.trim()` trên một con số và trả 500.
 */
export class CreateListDto {
  @IsUUID('4', { message: 'boardId must be a valid id.' })
  boardId: string;

  @IsString({ message: 'name must be text.' })
  @IsNotEmpty({ message: 'name is required.' })
  @MaxLength(120, { message: 'name cannot exceed 120 characters.' })
  name: string;
}
