import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSavedFilterDto {
  @IsUUID('4', { message: 'boardId phải là uuid hợp lệ.' })
  boardId: string;

  @IsString()
  @MinLength(1, { message: 'Tên bộ lọc không được để trống.' })
  @MaxLength(80, { message: 'Tên bộ lọc tối đa 80 ký tự.' })
  name: string;

  // ⚠️ @IsString chứ KHÔNG phải @IsUUID: assignee là Firebase uid (chuỗi 28 ký
  //    tự), không phải uuid. Dùng @IsUUID ở đây là mọi bộ lọc theo người phụ
  //    trách đều bị trả 400.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  assigneeIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true, message: 'labelIds phải là danh sách uuid.' })
  labelIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsIn(['high', 'medium', 'low'], { each: true, message: 'priorities chỉ nhận high, medium, low.' })
  priorities?: string[];

  @IsOptional()
  @IsIn(['overdue', 'today', 'week'], { message: 'dateFilter chỉ nhận overdue, today hoặc week.' })
  dateFilter?: string | null;
}

export class CreateHighlightGroupDto {
  @IsUUID('4', { message: 'boardId phải là uuid hợp lệ.' })
  boardId: string;

  @IsString()
  @MinLength(1, { message: 'Tên nhóm không được để trống.' })
  @MaxLength(80, { message: 'Tên nhóm tối đa 80 ký tự.' })
  name: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true, message: 'cardIds phải là danh sách uuid.' })
  cardIds?: string[];
}
