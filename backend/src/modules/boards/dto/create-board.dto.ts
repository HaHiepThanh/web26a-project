import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Ba mức, khớp đúng ràng buộc CHECK của cột `boards.visibility`. */
export const BOARD_VISIBILITY = ['workspace', 'private', 'public'] as const;

export class CreateBoardDto {
  @IsUUID('4', { message: 'workspaceId must be a valid id.' })
  workspaceId: string;

  @IsString({ message: 'name must be text.' })
  @IsNotEmpty({ message: 'name is required.' })
  @MaxLength(120, { message: 'name cannot exceed 120 characters.' })
  name: string;

  @IsOptional()
  @IsIn(BOARD_VISIBILITY, {
    message: "visibility must be 'workspace', 'private', or 'public'.",
  })
  visibility?: (typeof BOARD_VISIBILITY)[number];

  /**
   * ⚠️ KHÔNG dùng `@IsUUID` ở đây: `users.id` là Firebase uid (28 ký tự), không
   *    phải uuid. Đây là cái bẫy đã cắn nhiều lần trong dự án này — mọi cột trỏ
   *    tới `users.id` đều là `text`, chỉ các bảng khác mới dùng uuid.
   */
  @IsOptional()
  @IsArray({ message: 'memberIds must be a list.' })
  @IsString({ each: true, message: 'each memberId must be text.' })
  @ArrayMaxSize(200, { message: 'Cannot add more than 200 members at once.' })
  memberIds?: string[];
}
