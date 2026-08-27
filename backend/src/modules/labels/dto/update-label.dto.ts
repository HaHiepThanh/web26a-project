import { IsHexColor, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateLabelDto {
  @IsOptional()
  @IsString({ message: 'name must be text.' })
  @MaxLength(60, { message: 'name cannot exceed 60 characters.' })
  name?: string;

  @IsOptional()
  @IsHexColor({ message: 'color must be a hex value, e.g. #22C55E.' })
  color?: string;
}
