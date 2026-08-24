import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RenameListDto {
  @IsString({ message: 'name must be text.' })
  @IsNotEmpty({ message: 'name is required.' })
  @MaxLength(120, { message: 'name cannot exceed 120 characters.' })
  name: string;
}
