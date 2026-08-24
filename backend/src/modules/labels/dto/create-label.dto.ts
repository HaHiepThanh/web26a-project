import {
  IsHexColor,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateLabelDto {
  @IsUUID('4', { message: 'boardId must be a valid id.' })
  boardId: string;

  @IsString({ message: 'name must be text.' })
  @IsNotEmpty({ message: 'name is required.' })
  @MaxLength(60, { message: 'name cannot exceed 60 characters.' })
  name: string;

  /** Nhãn màu hiển thị khắp board — nhận sai định dạng là giao diện vỡ. */
  @IsHexColor({ message: 'color must be a hex value, e.g. #22C55E.' })
  color: string;
}
