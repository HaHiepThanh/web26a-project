import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { BOARD_VISIBILITY } from './create-board.dto';

export class UpdateBoardDto {
  @IsOptional()
  @IsString({ message: 'name must be text.' })
  @IsNotEmpty({ message: 'name cannot be empty.' })
  @MaxLength(120, { message: 'name cannot exceed 120 characters.' })
  name?: string;

  @IsOptional()
  @IsIn(BOARD_VISIBILITY, {
    message: "visibility must be 'workspace', 'private', or 'public'.",
  })
  visibility?: (typeof BOARD_VISIBILITY)[number];

  /** Firebase uid, không phải uuid — xem chú thích ở CreateBoardDto. */
  @IsOptional()
  @IsArray({ message: 'memberIds must be a list.' })
  @IsString({ each: true, message: 'each memberId must be text.' })
  @ArrayMaxSize(200, { message: 'Cannot add more than 200 members at once.' })
  memberIds?: string[];

  /**
   * `null` là giá trị HỢP LỆ, mang nghĩa "bỏ nền, quay về mặc định".
   * `@IsOptional()` bỏ qua kiểm tra cho cả `undefined` lẫn `null`, nên gửi
   * `background: null` đi qua được — đúng ý ở đây.
   */
  @IsOptional()
  @IsString({ message: 'background must be text or null.' })
  @MaxLength(80, { message: 'background is too long.' })
  background?: string | null;

  @IsOptional()
  @IsString({ message: 'backgroundImagePath must be text or null.' })
  @MaxLength(400, { message: 'backgroundImagePath is too long.' })
  backgroundImagePath?: string | null;
}
