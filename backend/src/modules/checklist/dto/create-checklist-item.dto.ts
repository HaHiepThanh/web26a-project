import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateChecklistItemDto {
  @IsUUID('4', { message: 'cardId phải là uuid hợp lệ.' })
  cardId: string;

  @IsString()
  @MinLength(1, { message: 'Nội dung không được để trống.' })
  @MaxLength(300, { message: 'Nội dung tối đa 300 ký tự.' })
  content: string;
}

export class UpdateChecklistItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Nội dung không được để trống.' })
  @MaxLength(300, { message: 'Nội dung tối đa 300 ký tự.' })
  content?: string;

  @IsOptional()
  @IsBoolean({ message: 'isDone phải là true/false.' })
  isDone?: boolean;

  @IsOptional()
  @IsNumber({}, { message: 'position phải là số.' })
  position?: number;
}
