import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateChecklistItemDto {
  @IsUUID('4', { message: 'cardId must be a valid uuid.' })
  cardId: string;

  @IsString()
  @MinLength(1, { message: 'Content is required.' })
  @MaxLength(300, { message: 'Content must be at most 300 characters.' })
  content: string;
}

export class UpdateChecklistItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Content is required.' })
  @MaxLength(300, { message: 'Content must be at most 300 characters.' })
  content?: string;

  @IsOptional()
  @IsBoolean({ message: 'isDone must be true/false.' })
  isDone?: boolean;

  @IsOptional()
  @IsNumber({}, { message: 'position must be a number.' })
  position?: number;
}
