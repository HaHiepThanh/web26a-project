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
  @IsUUID('4', { message: 'boardId must be a valid uuid.' })
  boardId: string;

  @IsString()
  @MinLength(1, { message: 'Filter name is required.' })
  @MaxLength(80, { message: 'Filter name must be at most 80 characters.' })
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
  @IsUUID('4', { each: true, message: 'labelIds must be a list of uuids.' })
  labelIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsIn(['high', 'medium', 'low'], { each: true, message: 'priorities must be high, medium, or low.' })
  priorities?: string[];

  @IsOptional()
  @IsIn(['overdue', 'today', 'week'], { message: 'dateFilter must be overdue, today, or week.' })
  dateFilter?: string | null;
}

export class CreateHighlightGroupDto {
  @IsUUID('4', { message: 'boardId must be a valid uuid.' })
  boardId: string;

  @IsString()
  @MinLength(1, { message: 'Group name is required.' })
  @MaxLength(80, { message: 'Group name must be at most 80 characters.' })
  name: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true, message: 'cardIds must be a list of uuids.' })
  cardIds?: string[];
}
