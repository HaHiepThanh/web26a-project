import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Một thẻ trong danh sách người dùng đã xem lại và sửa ở modal. */
export class AcceptedCardDto {
  @IsString()
  @MinLength(1, { message: 'Tên thẻ không được để trống.' })
  @MaxLength(200, { message: 'Tên thẻ tối đa 200 ký tự.' })
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  // ⚠️ @IsString chứ KHÔNG phải @IsUUID: assignee là Firebase uid (chuỗi 28 ký
  //    tự), không phải uuid. Dùng @IsUUID ở đây là mọi thẻ có người phụ trách
  //    đều bị trả 400.
  @IsOptional()
  @IsString()
  @MaxLength(128)
  assigneeId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dueDate phải dạng YYYY-MM-DD.' })
  dueDate?: string;

  @IsUUID('4', { message: 'listId phải là uuid hợp lệ.' })
  listId: string;

  @IsOptional()
  @IsIn(['high', 'medium', 'low'], { message: 'priority chỉ nhận high, medium hoặc low.' })
  priority?: 'high' | 'medium' | 'low';
}

export class AcceptSuggestionDto {
  @IsArray()
  @ArrayMaxSize(10, { message: 'Tối đa 10 thẻ mỗi lần.' })
  @ValidateNested({ each: true })
  @Type(() => AcceptedCardDto)
  cards: AcceptedCardDto[];
}
