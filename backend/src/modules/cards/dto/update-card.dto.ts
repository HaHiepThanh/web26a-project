import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCardDto {
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Tên thẻ tối đa 200 ký tự.' })
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['low', 'medium', 'high'], {
    message: 'priority chỉ nhận low, medium hoặc high.',
  })
  priority?: string;

  @IsOptional()
  @IsDateString({}, { message: 'dueDate phải đúng định dạng ngày (ISO 8601).' })
  dueDate?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;
}
