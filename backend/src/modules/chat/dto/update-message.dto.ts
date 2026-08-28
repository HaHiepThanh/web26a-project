import { IsString, MinLength } from 'class-validator';

export class UpdateMessageDto {
  @IsString()
  @MinLength(1, { message: 'Message content is required.' })
  content: string;
}
