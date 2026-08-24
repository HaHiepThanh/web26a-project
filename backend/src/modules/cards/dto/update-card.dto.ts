import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCardDto {
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Card title must be at most 200 characters.' })
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['low', 'medium', 'high'], {
    message: 'priority must be low, medium, or high.',
  })
  priority?: string;

  @IsOptional()
  @IsDateString({}, { message: 'dueDate must be a valid date (ISO 8601).' })
  dueDate?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;
}
